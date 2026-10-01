import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { KurdCoin, KurdCoinTimelock, MockSafeMultisig } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("KURD COIN — PHASE 10: GOVERNANCE & ACCESS CONTROL REHEARSAL", function () {
  let kurdCoin: KurdCoin;
  let timelock: KurdCoinTimelock;
  let multisig: MockSafeMultisig;

  let deployer: HardhatEthersSigner;
  let signerA: HardhatEthersSigner;
  let signerB: HardhatEthersSigner;
  let signerC: HardhatEthersSigner;
  let signerD: HardhatEthersSigner;
  let signerE: HardhatEthersSigner;
  let emergencyGuardian: HardhatEthersSigner;
  let unauthorizedUser: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;

  const MAX_SUPPLY_WHOLE = 10_000_000_000n; // 10 Billion KC
  const TIMELOCK_DELAY_24H = 86_400; // 24 hours in seconds

  let DEFAULT_ADMIN_ROLE: string;
  let MINTER_ROLE: string;
  let PAUSER_ROLE: string;

  beforeEach(async function () {
    [
      deployer,
      signerA,
      signerB,
      signerC,
      signerD,
      signerE,
      emergencyGuardian,
      unauthorizedUser,
      recipient,
    ] = await ethers.getSigners();

    // 1. Deploy KurdCoin (simulating testnet deployer setup)
    const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
    kurdCoin = await KurdCoinFactory.deploy("Kurd Coin", "KC", MAX_SUPPLY_WHOLE);
    await kurdCoin.waitForDeployment();

    DEFAULT_ADMIN_ROLE = await kurdCoin.DEFAULT_ADMIN_ROLE();
    MINTER_ROLE = await kurdCoin.MINTER_ROLE();
    PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();

    // 2. Deploy 2-of-3 Multisig (Signers A, B, C)
    const MockSafeFactory = await ethers.getContractFactory("MockSafeMultisig");
    multisig = await MockSafeFactory.deploy(
      [signerA.address, signerB.address, signerC.address],
      2 // 2-of-3 threshold
    );
    await multisig.waitForDeployment();

    // 3. Deploy TimelockController (Proposer = Multisig, Executor = Multisig, Admin = address(0))
    const TimelockFactory = await ethers.getContractFactory("KurdCoinTimelock");
    timelock = await TimelockFactory.deploy(
      TIMELOCK_DELAY_24H,
      [await multisig.getAddress()], // Proposers
      [await multisig.getAddress()], // Executors
      ethers.ZeroAddress // OpenZeppelin v5 pattern: timelock administers itself
    );
    await timelock.waitForDeployment();
  });

  // =========================================================================
  // SUITE 1: MULTISIG THRESHOLD GOVERNANCE (2-of-3 & 3-of-5)
  // =========================================================================
  describe("1. Safe Multisig Threshold Rehearsal", function () {
    it("1.1 Proposing an admin action creates a pending transaction with 1 confirmation", async function () {
      const target = await kurdCoin.getAddress();
      const callData = kurdCoin.interface.encodeFunctionData("pause");

      await expect(
        multisig.connect(signerA).submitTransaction(target, 0, callData)
      )
        .to.emit(multisig, "SubmitTransaction")
        .withArgs(signerA.address, 0, target, 0, callData);

      const txInfo = await multisig.transactions(0);
      expect(txInfo.executed).to.be.false;
      expect(txInfo.confirmationsCount).to.equal(1n);
    });

    it("1.2 Single signer CANNOT execute transaction alone (rejects with insufficient confirmations)", async function () {
      const target = await kurdCoin.getAddress();
      const callData = kurdCoin.interface.encodeFunctionData("pause");

      await multisig.connect(signerA).submitTransaction(target, 0, callData);

      await expect(
        multisig.connect(signerA).executeTransaction(0)
      ).to.be.revertedWith("MockSafe: cannot execute: insufficient confirmations");
    });

    it("1.3 Non-owner cannot submit, confirm, or execute transactions", async function () {
      const target = await kurdCoin.getAddress();
      const callData = kurdCoin.interface.encodeFunctionData("pause");

      await expect(
        multisig.connect(unauthorizedUser).submitTransaction(target, 0, callData)
      ).to.be.revertedWith("MockSafe: caller is not an owner");

      await multisig.connect(signerA).submitTransaction(target, 0, callData);

      await expect(
        multisig.connect(unauthorizedUser).confirmTransaction(0)
      ).to.be.revertedWith("MockSafe: caller is not an owner");

      await expect(
        multisig.connect(unauthorizedUser).executeTransaction(0)
      ).to.be.revertedWith("MockSafe: caller is not an owner");
    });

    it("1.4 Reaching threshold (2-of-3) allows execution; revoking blocks execution", async function () {
      const target = await kurdCoin.getAddress();
      const callData = kurdCoin.interface.encodeFunctionData("pause");

      // Signer A submits (1 confirmation)
      await multisig.connect(signerA).submitTransaction(target, 0, callData);

      // Signer B confirms (2 confirmations = threshold met)
      await expect(multisig.connect(signerB).confirmTransaction(0))
        .to.emit(multisig, "ConfirmTransaction")
        .withArgs(signerB.address, 0);

      // Signer B revokes confirmation (falls back to 1 confirmation)
      await expect(multisig.connect(signerB).revokeConfirmation(0))
        .to.emit(multisig, "RevokeConfirmation")
        .withArgs(signerB.address, 0);

      // Execution must fail now
      await expect(
        multisig.connect(signerA).executeTransaction(0)
      ).to.be.revertedWith("MockSafe: cannot execute: insufficient confirmations");

      // Signer C confirms -> threshold reached again
      await multisig.connect(signerC).confirmTransaction(0);

      // To execute pause on KurdCoin, multisig needs PAUSER_ROLE
      await kurdCoin.connect(deployer).grantRole(PAUSER_ROLE, await multisig.getAddress());

      // Now execution succeeds
      await expect(multisig.connect(signerA).executeTransaction(0))
        .to.emit(multisig, "ExecuteTransaction")
        .withArgs(signerA.address, 0);

      expect(await kurdCoin.paused()).to.be.true;
    });

    it("1.5 Emulates 3-of-5 Multisig setup cleanly", async function () {
      const MockSafeFactory = await ethers.getContractFactory("MockSafeMultisig");
      const safe3of5 = await MockSafeFactory.deploy(
        [signerA.address, signerB.address, signerC.address, signerD.address, signerE.address],
        3 // 3-of-5 threshold
      );

      const target = await kurdCoin.getAddress();
      const callData = kurdCoin.interface.encodeFunctionData("pause");

      // Signer A submits (1)
      await safe3of5.connect(signerA).submitTransaction(target, 0, callData);

      // Signer B confirms (2)
      await safe3of5.connect(signerB).confirmTransaction(0);

      // 2 is not enough for 3-of-5
      await expect(
        safe3of5.connect(signerA).executeTransaction(0)
      ).to.be.revertedWith("MockSafe: cannot execute: insufficient confirmations");

      // Signer C confirms (3 - threshold reached)
      await safe3of5.connect(signerC).confirmTransaction(0);

      await kurdCoin.connect(deployer).grantRole(PAUSER_ROLE, await safe3of5.getAddress());

      await expect(safe3of5.connect(signerD).executeTransaction(0))
        .to.emit(safe3of5, "ExecuteTransaction");

      expect(await kurdCoin.paused()).to.be.true;
    });
  });

  // =========================================================================
  // SUITE 2: TIMELOCK CONTROLLER REHEARSAL
  // =========================================================================
  describe("2. TimelockController Queue, Delay & Execution Rehearsal", function () {
    let targetAddress: string;
    let grantRoleCalldata: string;
    let operationId: string;
    const salt = ethers.encodeBytes32String("migration-signer-grant-v1");

    beforeEach(async function () {
      targetAddress = await kurdCoin.getAddress();
      // Grant DEFAULT_ADMIN_ROLE to Timelock so it can grant roles
      await kurdCoin.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, await timelock.getAddress());

      // Prepare action: grant MINTER_ROLE to recipient
      grantRoleCalldata = kurdCoin.interface.encodeFunctionData("grantRole", [
        MINTER_ROLE,
        recipient.address,
      ]);

      operationId = await timelock.hashOperation(
        targetAddress,
        0,
        grantRoleCalldata,
        ethers.ZeroHash,
        salt
      );
    });

    it("2.1 Unauthorized user cannot schedule or queue an operation in Timelock", async function () {
      await expect(
        timelock
          .connect(unauthorizedUser)
          .schedule(targetAddress, 0, grantRoleCalldata, ethers.ZeroHash, salt, TIMELOCK_DELAY_24H)
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("2.2 Proposer (Multisig) queues operation; early execution is strictly rejected", async function () {
      // Multisig queues operation in Timelock
      const scheduleCalldata = timelock.interface.encodeFunctionData("schedule", [
        targetAddress,
        0,
        grantRoleCalldata,
        ethers.ZeroHash,
        salt,
        TIMELOCK_DELAY_24H,
      ]);

      // Multisig 2-of-3 confirms and executes schedule
      await multisig.connect(signerA).submitTransaction(await timelock.getAddress(), 0, scheduleCalldata);
      await multisig.connect(signerB).confirmTransaction(0);
      await multisig.connect(signerA).executeTransaction(0);

      // Verify operation is queued and pending in Timelock
      expect(await timelock.isOperationPending(operationId)).to.be.true;
      expect(await timelock.isOperationReady(operationId)).to.be.false;

      // Attempt to execute through multisig BEFORE 24h delay elapses
      const executeCalldata = timelock.interface.encodeFunctionData("execute", [
        targetAddress,
        0,
        grantRoleCalldata,
        ethers.ZeroHash,
        salt,
      ]);

      await multisig.connect(signerA).submitTransaction(await timelock.getAddress(), 0, executeCalldata);
      await multisig.connect(signerB).confirmTransaction(1);

      // Must revert because delay has not elapsed
      await expect(
        multisig.connect(signerA).executeTransaction(1)
      ).to.be.reverted; // Reverts with TimelockUnexpectedOperationState
    });

    it("2.3 Operation executes successfully after required delay (24 hours)", async function () {
      // Queue via multisig
      const scheduleCalldata = timelock.interface.encodeFunctionData("schedule", [
        targetAddress,
        0,
        grantRoleCalldata,
        ethers.ZeroHash,
        salt,
        TIMELOCK_DELAY_24H,
      ]);

      await multisig.connect(signerA).submitTransaction(await timelock.getAddress(), 0, scheduleCalldata);
      await multisig.connect(signerB).confirmTransaction(0);
      await multisig.connect(signerA).executeTransaction(0);

      // Fast forward time by 24h + 10s
      await time.increase(TIMELOCK_DELAY_24H + 10);

      expect(await timelock.isOperationReady(operationId)).to.be.true;

      // Execute via multisig
      const executeCalldata = timelock.interface.encodeFunctionData("execute", [
        targetAddress,
        0,
        grantRoleCalldata,
        ethers.ZeroHash,
        salt,
      ]);

      await multisig.connect(signerA).submitTransaction(await timelock.getAddress(), 0, executeCalldata);
      await multisig.connect(signerB).confirmTransaction(1);
      await multisig.connect(signerA).executeTransaction(1);

      expect(await timelock.isOperationDone(operationId)).to.be.true;

      // Confirm role was granted to recipient on KurdCoin!
      expect(await kurdCoin.hasRole(MINTER_ROLE, recipient.address)).to.be.true;
    });

    it("2.4 Cancellation works: Proposer can cancel a queued operation before execution", async function () {
      // Queue via multisig
      const scheduleCalldata = timelock.interface.encodeFunctionData("schedule", [
        targetAddress,
        0,
        grantRoleCalldata,
        ethers.ZeroHash,
        salt,
        TIMELOCK_DELAY_24H,
      ]);

      await multisig.connect(signerA).submitTransaction(await timelock.getAddress(), 0, scheduleCalldata);
      await multisig.connect(signerB).confirmTransaction(0);
      await multisig.connect(signerA).executeTransaction(0);

      expect(await timelock.isOperationPending(operationId)).to.be.true;

      // Multisig cancels operation
      const cancelCalldata = timelock.interface.encodeFunctionData("cancel", [operationId]);
      await multisig.connect(signerA).submitTransaction(await timelock.getAddress(), 0, cancelCalldata);
      await multisig.connect(signerB).confirmTransaction(1);
      await multisig.connect(signerA).executeTransaction(1);

      // Operation is no longer pending
      expect(await timelock.isOperation(operationId)).to.be.false;

      // Even if time passes, it cannot execute
      await time.increase(TIMELOCK_DELAY_24H + 10);
      expect(await timelock.isOperationReady(operationId)).to.be.false;
    });
  });

  // =========================================================================
  // SUITE 3: EMERGENCY PAUSE & SEPARATION OF POWERS
  // =========================================================================
  describe("3. Emergency Pause Design & Least Privilege Separation", function () {
    beforeEach(async function () {
      // Grant PAUSER_ROLE to Emergency Guardian (monitored fast key / multisig)
      await kurdCoin.connect(deployer).grantRole(PAUSER_ROLE, emergencyGuardian.address);
    });

    it("3.1 Emergency Guardian can instantly freeze the token without timelock delay", async function () {
      expect(await kurdCoin.paused()).to.be.false;

      // Guardian calls pause directly
      await expect(kurdCoin.connect(emergencyGuardian).pause())
        .to.emit(kurdCoin, "Paused")
        .withArgs(emergencyGuardian.address);

      expect(await kurdCoin.paused()).to.be.true;
    });

    it("3.2 Paused state strictly blocks mint, transfer, and claimWithAuthorization", async function () {
      await kurdCoin.connect(emergencyGuardian).pause();

      // Grant deployer MINTER to test mint while paused
      await kurdCoin.connect(deployer).grantRole(MINTER_ROLE, deployer.address);

      // Mint must fail when paused
      await expect(
        kurdCoin.connect(deployer).mint(recipient.address, ethers.parseUnits("10", 18))
      ).to.be.revertedWithCustomError(kurdCoin, "EnforcedPause");

      // Transfer must fail when paused
      await expect(
        kurdCoin.connect(deployer).transfer(recipient.address, 100)
      ).to.be.revertedWithCustomError(kurdCoin, "EnforcedPause");
    });

    it("3.3 Emergency Guardian has ZERO minting authority and ZERO admin authority", async function () {
      // Guardian cannot mint
      await expect(
        kurdCoin.connect(emergencyGuardian).mint(recipient.address, 1000)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // Guardian cannot grant roles
      await expect(
        kurdCoin.connect(emergencyGuardian).grantRole(MINTER_ROLE, emergencyGuardian.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // Guardian cannot revoke admin roles
      await expect(
        kurdCoin.connect(emergencyGuardian).revokeRole(DEFAULT_ADMIN_ROLE, deployer.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });

    it("3.4 Unpausing can be executed by designated authority once safety verified", async function () {
      await kurdCoin.connect(emergencyGuardian).pause();
      expect(await kurdCoin.paused()).to.be.true;

      // Guardian unpauses
      await expect(kurdCoin.connect(emergencyGuardian).unpause())
        .to.emit(kurdCoin, "Unpaused")
        .withArgs(emergencyGuardian.address);

      expect(await kurdCoin.paused()).to.be.false;
    });
  });

  // =========================================================================
  // SUITE 4: COMPLETE ROLE TRANSFER REHEARSAL (DEVOPS SEQUENCE)
  // =========================================================================
  describe("4. Deployer EOA Role Renouncement & Multisig Handover Rehearsal", function () {
    it("4.1 Executes full 7-step governance handover sequence cleanly", async function () {
      const timelockAddress = await timelock.getAddress();

      // STEP 1: Verify deployer initially holds DEFAULT_ADMIN_ROLE and PAUSER_ROLE
      expect(await kurdCoin.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
      expect(await kurdCoin.hasRole(PAUSER_ROLE, deployer.address)).to.be.true;

      // STEP 2: Grant DEFAULT_ADMIN_ROLE to TimelockController
      await kurdCoin.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, timelockAddress);
      expect(await kurdCoin.hasRole(DEFAULT_ADMIN_ROLE, timelockAddress)).to.be.true;

      // STEP 3: Grant PAUSER_ROLE to Multisig / Emergency Guardian
      await kurdCoin.connect(deployer).grantRole(PAUSER_ROLE, emergencyGuardian.address);
      expect(await kurdCoin.hasRole(PAUSER_ROLE, emergencyGuardian.address)).to.be.true;

      // STEP 4: Deployer safely renounces all privileged roles
      await kurdCoin.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
      await kurdCoin.connect(deployer).renounceRole(PAUSER_ROLE, deployer.address);

      // STEP 5: Confirm deployer NO LONGER holds any privileged roles
      expect(await kurdCoin.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.false;
      expect(await kurdCoin.hasRole(PAUSER_ROLE, deployer.address)).to.be.false;
      expect(await kurdCoin.hasRole(MINTER_ROLE, deployer.address)).to.be.false;

      // STEP 6: Confirm deployer is strictly blocked from all privileged actions
      // A. Cannot grant roles
      await expect(
        kurdCoin.connect(deployer).grantRole(MINTER_ROLE, deployer.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // B. Cannot revoke roles
      await expect(
        kurdCoin.connect(deployer).revokeRole(DEFAULT_ADMIN_ROLE, timelockAddress)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // C. Cannot pause contract
      await expect(
        kurdCoin.connect(deployer).pause()
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // D. Cannot mint tokens
      await expect(
        kurdCoin.connect(deployer).mint(recipient.address, 1000)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // STEP 7: Confirm Governance (Timelock) remains the sole authoritative admin
      expect(await kurdCoin.hasRole(DEFAULT_ADMIN_ROLE, timelockAddress)).to.be.true;

      // Deployer cannot regain role on their own
      await expect(
        kurdCoin.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, deployer.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });
  });

  // =========================================================================
  // SUITE 5: MINTER_ROLE HARDENING & 10B KC CAP INVARIANTS
  // =========================================================================
  describe("5. Minter Role Hardening & Economic Boundary Tests", function () {
    beforeEach(async function () {
      // Grant MINTER_ROLE to deployer for testing economic bounds
      await kurdCoin.connect(deployer).grantRole(MINTER_ROLE, deployer.address);
    });

    it("5.1 Minter can mint within 10B KC cap", async function () {
      const amount = ethers.parseUnits("500", 18);
      await kurdCoin.connect(deployer).mint(recipient.address, amount);

      expect(await kurdCoin.balanceOf(recipient.address)).to.equal(amount);
      expect(await kurdCoin.totalMinted()).to.equal(amount);
    });

    it("5.2 Minting exceeding 10 Billion KC cap is strictly rejected", async function () {
      const cap = await kurdCoin.cap();
      const excessAmount = cap + 1n;

      await expect(
        kurdCoin.connect(deployer).mint(recipient.address, excessAmount)
      ).to.be.revertedWith("KurdCoin: total minted exceeds cap");
    });

    it("5.3 Burning tokens reduces circulating supply but does NOT increase mintable capacity", async function () {
      const amount = ethers.parseUnits("1000", 18);
      await kurdCoin.connect(deployer).mint(recipient.address, amount);

      expect(await kurdCoin.totalSupply()).to.equal(amount);
      expect(await kurdCoin.totalMinted()).to.equal(amount);

      // Recipient burns 400 KC
      await kurdCoin.connect(recipient).burn(ethers.parseUnits("400", 18));

      // Circulating supply decreases to 600 KC
      expect(await kurdCoin.totalSupply()).to.equal(ethers.parseUnits("600", 18));

      // Lifetime minted remains 1000 KC (monotonic, cannot be recycled)
      expect(await kurdCoin.totalMinted()).to.equal(amount);
    });

    it("5.4 Unauthorized address cannot mint", async function () {
      await expect(
        kurdCoin.connect(unauthorizedUser).mint(unauthorizedUser.address, 1000)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });
  });
});

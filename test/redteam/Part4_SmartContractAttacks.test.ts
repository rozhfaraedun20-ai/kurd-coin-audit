import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("KURD COIN — RED TEAM PART 4: ADVERSARIAL SMART-CONTRACT TESTING", function () {
  let kurdCoin: any;
  let timelock: any;
  let mockSafe: any;

  let deployer: any;
  let minter: any;
  let pauser: any;
  let guardian: any;
  let attacker: any;
  let alice: any;
  let bob: any;

  const MAX_SUPPLY_UNITS = 10_000_000_000n; // 10 Billion KC
  const DECIMALS = 18n;
  const CAP_WEI = MAX_SUPPLY_UNITS * (10n ** DECIMALS);
  const MIN_DELAY = 48 * 3600; // 48-hour timelock

  beforeEach(async function () {
    [deployer, minter, pauser, guardian, attacker, alice, bob] = await ethers.getSigners();

    // Deploy KurdCoin
    const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
    kurdCoin = await KurdCoinFactory.deploy("Kurd Coin", "KC", MAX_SUPPLY_UNITS);
    await kurdCoin.waitForDeployment();

    // Deploy MockSafeMultisig with 2-of-3 threshold
    const MockSafeFactory = await ethers.getContractFactory("MockSafeMultisig");
    mockSafe = await MockSafeFactory.deploy(
      [deployer.address, alice.address, bob.address],
      2
    );
    await mockSafe.waitForDeployment();

    // Deploy KurdCoinTimelock
    const TimelockFactory = await ethers.getContractFactory("KurdCoinTimelock");
    timelock = await TimelockFactory.deploy(
      MIN_DELAY,
      [await mockSafe.getAddress()], // Proposers: Multisig
      [await mockSafe.getAddress()], // Executors: Multisig
      deployer.address               // Admin during setup
    );
    await timelock.waitForDeployment();

    // Grant roles for testing
    const MINTER_ROLE = await kurdCoin.MINTER_ROLE();
    const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
    const DEFAULT_ADMIN_ROLE = await kurdCoin.DEFAULT_ADMIN_ROLE();
    await kurdCoin.grantRole(MINTER_ROLE, minter.address);
    await kurdCoin.grantRole(PAUSER_ROLE, pauser.address);
    await kurdCoin.grantRole(DEFAULT_ADMIN_ROLE, await timelock.getAddress());
  });

  describe("1. Supply Cap & Burn-Remint Exploit Attempts", function () {
    it("ATTACK 1.1: Attacker attempts to directly mint tokens", async function () {
      await expect(
        kurdCoin.connect(attacker).mint(attacker.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });

    it("ATTACK 1.2: Minter attempts to exceed the 10 Billion KC cap", async function () {
      // Mint up to the cap
      await kurdCoin.connect(minter).mint(alice.address, CAP_WEI);
      expect(await kurdCoin.totalMinted()).to.equal(CAP_WEI);
      expect(await kurdCoin.totalSupply()).to.equal(CAP_WEI);

      // Attempt to mint 1 more wei
      await expect(
        kurdCoin.connect(minter).mint(alice.address, 1n)
      ).to.be.revertedWith("KurdCoin: total minted exceeds cap");
    });

    it("ATTACK 1.3: Attacker burns tokens to trick contract into reopening mint capacity", async function () {
      // Mint 100,000 KC to Alice
      const mintAmount = ethers.parseEther("100000");
      await kurdCoin.connect(minter).mint(alice.address, mintAmount);

      // Alice burns 50,000 KC
      const burnAmount = ethers.parseEther("50000");
      await kurdCoin.connect(alice).burn(burnAmount);

      // Total supply has decreased
      expect(await kurdCoin.totalSupply()).to.equal(mintAmount - burnAmount);
      // But totalMinted MUST remain unchanged
      expect(await kurdCoin.totalMinted()).to.equal(mintAmount);

      // Now mint the remaining capacity up to CAP
      const remainingToCap = CAP_WEI - mintAmount;
      await kurdCoin.connect(minter).mint(bob.address, remainingToCap);
      expect(await kurdCoin.totalMinted()).to.equal(CAP_WEI);

      // Attempt to mint the burned 50,000 KC back: MUST BE STRICTLY REJECTED
      await expect(
        kurdCoin.connect(minter).mint(alice.address, burnAmount)
      ).to.be.revertedWith("KurdCoin: total minted exceeds cap");
    });

    it("ATTACK 1.4: Minting to address(0) or 0 amount is strictly rejected", async function () {
      await expect(
        kurdCoin.connect(minter).mint(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWith("KurdCoin: mint to zero address");

      await expect(
        kurdCoin.connect(minter).mint(alice.address, 0n)
      ).to.be.revertedWith("KurdCoin: amount must be > 0");
    });
  });

  describe("2. Access Control & Privilege Escalation Attempts", function () {
    it("ATTACK 2.1: Non-admin attempts to grant themselves MINTER_ROLE or PAUSER_ROLE", async function () {
      const MINTER_ROLE = await kurdCoin.MINTER_ROLE();
      const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
      const DEFAULT_ADMIN_ROLE = await kurdCoin.DEFAULT_ADMIN_ROLE();

      await expect(
        kurdCoin.connect(attacker).grantRole(MINTER_ROLE, attacker.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      await expect(
        kurdCoin.connect(attacker).grantRole(PAUSER_ROLE, attacker.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      await expect(
        kurdCoin.connect(attacker).grantRole(DEFAULT_ADMIN_ROLE, attacker.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });

    it("ATTACK 2.2: Attacker attempts to bypass pause checks", async function () {
      await kurdCoin.connect(minter).mint(alice.address, ethers.parseEther("1000"));

      // Pauser freezes contract
      await kurdCoin.connect(pauser).pause();
      expect(await kurdCoin.paused()).to.be.true;

      // Transfer attempt while paused MUST revert
      await expect(
        kurdCoin.connect(alice).transfer(bob.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(kurdCoin, "EnforcedPause");

      // Mint attempt while paused MUST revert
      await expect(
        kurdCoin.connect(minter).mint(bob.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(kurdCoin, "EnforcedPause");

      // Attacker attempts unauthorized unpause
      await expect(
        kurdCoin.connect(attacker).unpause()
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });
  });

  describe("3. EIP-712 Claim Authorization Tampering & Replay Attacks", function () {
    it("ATTACK 3.1: Attacker modifies amount or recipient with valid signature for another user", async function () {
      const amount = ethers.parseEther("100");
      const nonce = 0n;
      const latestBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt((latestBlock ? latestBlock.timestamp : Math.floor(Date.now() / 1000)) + 7200);

      // Generate valid signature for Alice
      const domain = {
        name: "Kurd Coin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await kurdCoin.getAddress(),
      };
      const types = {
        Claim: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = { to: alice.address, amount, nonce, deadline };
      const signature = await minter.signTypedData(domain, types, value);

      // Attacker tries to submit signature with their own address as recipient
      await expect(
        kurdCoin.connect(attacker).claimWithAuthorization(attacker.address, amount, nonce, deadline, signature)
      ).to.be.revertedWith("KurdCoin: signer is not a minter");

      // Attacker tries to submit signature with increased amount for Alice
      await expect(
        kurdCoin.connect(alice).claimWithAuthorization(alice.address, amount * 2n, nonce, deadline, signature)
      ).to.be.revertedWith("KurdCoin: signer is not a minter");
    });

    it("ATTACK 3.2: Replay attack: submitting same EIP-712 authorization twice", async function () {
      const amount = ethers.parseEther("50");
      const nonce = 0n;
      const latestBlock = await ethers.provider.getBlock("latest");
      const deadline = BigInt((latestBlock ? latestBlock.timestamp : Math.floor(Date.now() / 1000)) + 7200);

      const domain = {
        name: "Kurd Coin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await kurdCoin.getAddress(),
      };
      const types = {
        Claim: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = { to: alice.address, amount, nonce, deadline };
      const signature = await minter.signTypedData(domain, types, value);

      // First claim succeeds
      await kurdCoin.claimWithAuthorization(alice.address, amount, nonce, deadline, signature);
      expect(await kurdCoin.balanceOf(alice.address)).to.equal(amount);
      expect(await kurdCoin.claimNonces(alice.address)).to.equal(1n);

      // Second claim with SAME signature MUST revert due to nonce increment
      await expect(
        kurdCoin.claimWithAuthorization(alice.address, amount, nonce, deadline, signature)
      ).to.be.revertedWith("KurdCoin: invalid nonce");
    });

    it("ATTACK 3.3: Expired deadline claim is strictly rejected", async function () {
      const amount = ethers.parseEther("25");
      const nonce = 0n;
      const pastDeadline = 1000n; // Far past in history

      const domain = {
        name: "Kurd Coin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await kurdCoin.getAddress(),
      };
      const types = {
        Claim: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = { to: bob.address, amount, nonce, deadline: pastDeadline };
      const signature = await minter.signTypedData(domain, types, value);

      await expect(
        kurdCoin.claimWithAuthorization(bob.address, amount, nonce, pastDeadline, signature)
      ).to.be.revertedWith("KurdCoin: authorization expired");
    });
  });

  describe("4. Governance & Timelock Bypass Attacks", function () {
    it("ATTACK 4.1: Attacker attempts to bypass Timelock minimum delay", async function () {
      const kurdCoinAddr = await kurdCoin.getAddress();
      const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
      const callData = kurdCoin.interface.encodeFunctionData("grantRole", [PAUSER_ROLE, attacker.address]);

      // Attacker tries to directly schedule in Timelock
      await expect(
        timelock.connect(attacker).schedule(kurdCoinAddr, 0, callData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY)
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("ATTACK 4.2: Multisig schedules operation but attacker executes before 48h delay lapses", async function () {
      const kurdCoinAddr = await kurdCoin.getAddress();
      const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
      const callData = kurdCoin.interface.encodeFunctionData("grantRole", [PAUSER_ROLE, guardian.address]);
      const predecessor = ethers.ZeroHash;
      const salt = ethers.encodeBytes32String("salt-1");

      // Proposer (Multisig via proposal) queues operation
      const timelockAddr = await timelock.getAddress();
      const scheduleData = timelock.interface.encodeFunctionData("schedule", [
        kurdCoinAddr, 0, callData, predecessor, salt, MIN_DELAY
      ]);

      // Propose via MockSafe (2-of-3)
      await mockSafe.connect(deployer).submitTransaction(timelockAddr, 0, scheduleData);
      await mockSafe.connect(alice).confirmTransaction(0);
      await mockSafe.connect(deployer).executeTransaction(0);

      // Attempt to execute after only 1 hour (delay not met)
      await time.increase(3600);

      const executeData = timelock.interface.encodeFunctionData("execute", [
        kurdCoinAddr, 0, callData, predecessor, salt
      ]);

      await mockSafe.connect(deployer).submitTransaction(timelockAddr, 0, executeData);
      await mockSafe.connect(alice).confirmTransaction(1);

      // Multisig execution call to timelock must fail because timelock delay has not lapsed
      await expect(
        mockSafe.connect(deployer).executeTransaction(1)
      ).to.be.reverted;

      // Now advance time past full 48h delay
      await time.increase(MIN_DELAY);

      // Now execution succeeds
      await mockSafe.connect(deployer).executeTransaction(1);
      expect(await kurdCoin.hasRole(PAUSER_ROLE, guardian.address)).to.be.true;
    });

    it("ATTACK 4.3: Timelock replay: executing an already-executed proposal fails", async function () {
      const kurdCoinAddr = await kurdCoin.getAddress();
      const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
      const callData = kurdCoin.interface.encodeFunctionData("grantRole", [PAUSER_ROLE, guardian.address]);
      const predecessor = ethers.ZeroHash;
      const salt = ethers.encodeBytes32String("salt-replay");

      const timelockAddr = await timelock.getAddress();
      const scheduleData = timelock.interface.encodeFunctionData("schedule", [
        kurdCoinAddr, 0, callData, predecessor, salt, MIN_DELAY
      ]);

      await mockSafe.connect(deployer).submitTransaction(timelockAddr, 0, scheduleData);
      await mockSafe.connect(alice).confirmTransaction(0);
      await mockSafe.connect(deployer).executeTransaction(0);

      await time.increase(MIN_DELAY + 1);

      const executeData = timelock.interface.encodeFunctionData("execute", [
        kurdCoinAddr, 0, callData, predecessor, salt
      ]);

      await mockSafe.connect(deployer).submitTransaction(timelockAddr, 0, executeData);
      await mockSafe.connect(alice).confirmTransaction(1);
      await mockSafe.connect(deployer).executeTransaction(1);

      // Second attempt to execute the exact same operation via MockSafe must fail
      await mockSafe.connect(deployer).submitTransaction(timelockAddr, 0, executeData);
      await mockSafe.connect(alice).confirmTransaction(2);
      await expect(
        mockSafe.connect(deployer).executeTransaction(2)
      ).to.be.reverted;
    });
  });

  describe("5. Emergency Guardian Least Privilege Isolation", function () {
    it("GUARDIAN TEST: Guardian can pause instantly but has zero minting and zero admin power", async function () {
      const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
      const MINTER_ROLE = await kurdCoin.MINTER_ROLE();
      const DEFAULT_ADMIN_ROLE = await kurdCoin.DEFAULT_ADMIN_ROLE();

      // Deployer grants PAUSER_ROLE to guardian as emergency responder
      await kurdCoin.grantRole(PAUSER_ROLE, guardian.address);

      // Guardian pauses
      await kurdCoin.connect(guardian).pause();
      expect(await kurdCoin.paused()).to.be.true;

      // Guardian attempts to mint
      await expect(
        kurdCoin.connect(guardian).mint(guardian.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // Guardian attempts to grant role
      await expect(
        kurdCoin.connect(guardian).grantRole(MINTER_ROLE, guardian.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");

      // Guardian attempts to grant admin
      await expect(
        kurdCoin.connect(guardian).grantRole(DEFAULT_ADMIN_ROLE, guardian.address)
      ).to.be.revertedWithCustomError(kurdCoin, "AccessControlUnauthorizedAccount");
    });
  });
});

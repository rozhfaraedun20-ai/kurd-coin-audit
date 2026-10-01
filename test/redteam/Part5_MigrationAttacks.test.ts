import { expect } from "chai";
import { ethers } from "hardhat";
import { createEntitlementMerkleTree } from "../merkleTreeHelper";

describe("KURD COIN — RED TEAM PART 5: MIGRATION DESIGN ATTACK TESTS", function () {
  let kurdCoin: any;
  let distributor: any;
  let deployer: any;
  let minter: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let attacker: any;

  let merkleTree: any;
  const SNAPSHOT_BLOCK = 47461600;
  const SOURCE_CHAIN_ID = 84532; // Base Sepolia

  let aliceAllocation: bigint;
  let bobAllocation: bigint;
  let charlieAllocation: bigint;
  let totalAllocated: bigint;

  let aliceItem: any;
  let bobItem: any;

  beforeEach(async function () {
    [deployer, minter, alice, bob, charlie, attacker] = await ethers.getSigners();

    // Deploy KurdCoin
    const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
    kurdCoin = await KurdCoinFactory.deploy("Kurd Coin", "KC", 10_000_000_000n);
    await kurdCoin.waitForDeployment();

    const MINTER_ROLE = await kurdCoin.MINTER_ROLE();
    await kurdCoin.grantRole(MINTER_ROLE, minter.address);

    // Setup allocations
    aliceAllocation = ethers.parseEther("150.5");
    bobAllocation = ethers.parseEther("75.25");
    charlieAllocation = ethers.parseEther("10.0");
    totalAllocated = aliceAllocation + bobAllocation + charlieAllocation;

    const entitlements = [
      { address: alice.address, amountKc: "150.5", amountWei: aliceAllocation.toString() },
      { address: bob.address, amountKc: "75.25", amountWei: bobAllocation.toString() },
      { address: charlie.address, amountKc: "10.0", amountWei: charlieAllocation.toString() },
    ];

    merkleTree = createEntitlementMerkleTree(entitlements);
    aliceItem = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === alice.address.toLowerCase());
    bobItem = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === bob.address.toLowerCase());

    // Deploy KurdCoinMigrationDistributor
    const DistributorFactory = await ethers.getContractFactory("KurdCoinMigrationDistributor");
    distributor = await DistributorFactory.deploy(
      await kurdCoin.getAddress(),
      merkleTree.root,
      SNAPSHOT_BLOCK,
      SOURCE_CHAIN_ID
    );
    await distributor.waitForDeployment();

    // Fund distributor with totalAllocated
    await kurdCoin.connect(minter).mint(await distributor.getAddress(), totalAllocated);
  });

  describe("1. Double Claim & Replay Attacks", function () {
    it("ATTACK 5.1: Attacker attempts to claim twice with same index and proof", async function () {
      const proof = aliceItem.proof;

      // First claim succeeds
      await distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation, proof);
      expect(await kurdCoin.balanceOf(alice.address)).to.equal(aliceAllocation);
      expect(await distributor.isClaimed(aliceItem.index)).to.be.true;

      // Second claim MUST be strictly rejected
      await expect(
        distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation, proof)
      ).to.be.revertedWith("Migration already claimed");
    });

    it("ATTACK 5.2: Attacker attempts to front-run and claim Bob's allocation to attacker address", async function () {
      const proof = bobItem.proof;

      // Attacker passes Bob's index and amount, but puts attacker address
      await expect(
        distributor.connect(attacker).claimMigration(bobItem.index, attacker.address, bobAllocation, proof)
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("ATTACK 5.3: Attacker calls claim for Alice, tokens are delivered to Alice (not attacker)", async function () {
      const proof = aliceItem.proof;

      // Third party (attacker) executes transaction on behalf of Alice
      await distributor.connect(attacker).claimMigration(aliceItem.index, alice.address, aliceAllocation, proof);

      // Alice receives 100% of the tokens
      expect(await kurdCoin.balanceOf(alice.address)).to.equal(aliceAllocation);
      // Attacker receives 0 tokens
      expect(await kurdCoin.balanceOf(attacker.address)).to.equal(0n);
    });
  });

  describe("2. Merkle Proof & Amount Tampering Attacks", function () {
    it("ATTACK 5.4: Attacker inflates amount by 1 wei keeping valid proof", async function () {
      const proof = aliceItem.proof;

      await expect(
        distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation + 1n, proof)
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("ATTACK 5.5: Attacker passes type(uint256).max as amount", async function () {
      const proof = aliceItem.proof;
      const maxUint = ethers.MaxUint256;

      await expect(
        distributor.claimMigration(aliceItem.index, alice.address, maxUint, proof)
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("ATTACK 5.6: Attacker submits empty proof array", async function () {
      await expect(
        distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation, [])
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("ATTACK 5.7: Attacker submits garbage/corrupted proof bytes", async function () {
      const fakeProof = [
        ethers.encodeBytes32String("fake1"),
        ethers.encodeBytes32String("fake2"),
      ];
      await expect(
        distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation, fakeProof)
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("ATTACK 5.8: Attacker attempts zero address claim", async function () {
      const fakeProof = [ethers.ZeroHash];
      await expect(
        distributor.claimMigration(99, ethers.ZeroAddress, ethers.parseEther("10"), fakeProof)
      ).to.be.revertedWith("Invalid Merkle proof");
    });
  });

  describe("3. Distributor State & Insolvency Attacks", function () {
    it("ATTACK 5.9: Distributor is paused: all claims are frozen immediately", async function () {
      const proof = aliceItem.proof;

      await distributor.pause();
      expect(await distributor.paused()).to.be.true;

      await expect(
        distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation, proof)
      ).to.be.revertedWithCustomError(distributor, "EnforcedPause");

      // Non-owner cannot unpause
      await expect(
        distributor.connect(attacker).unpause()
      ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");

      // Owner unpauses, claim succeeds
      await distributor.unpause();
      await distributor.claimMigration(aliceItem.index, alice.address, aliceAllocation, proof);
      expect(await kurdCoin.balanceOf(alice.address)).to.equal(aliceAllocation);
    });

    it("ATTACK 5.10: Invariant: Distributor cannot transfer more than its balance", async function () {
      // Create underfunded distributor
      const singleTree = createEntitlementMerkleTree([
        { address: alice.address, amountKc: "500.0", amountWei: ethers.parseEther("500").toString() }
      ]);
      const DistributorFactory = await ethers.getContractFactory("KurdCoinMigrationDistributor");
      const underfundedDistributor = await DistributorFactory.deploy(
        await kurdCoin.getAddress(),
        singleTree.root,
        SNAPSHOT_BLOCK,
        SOURCE_CHAIN_ID
      );
      // Fund only 100 KC
      await kurdCoin.connect(minter).mint(await underfundedDistributor.getAddress(), ethers.parseEther("100"));

      const proof = singleTree.manifest[0].proof;
      // Attempting to claim 500 KC when contract has 100 KC reverts on ERC20 transfer
      await expect(
        underfundedDistributor.claimMigration(0, alice.address, ethers.parseEther("500"), proof)
      ).to.be.revertedWithCustomError(kurdCoin, "ERC20InsufficientBalance");
    });
  });
});

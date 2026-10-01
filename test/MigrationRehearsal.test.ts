import { expect } from "chai";
import { ethers } from "hardhat";
import { createEntitlementMerkleTree } from "./merkleTreeHelper";

describe("Kurd Coin — Phase 9 Migration Rehearsal (Harmless Local Simulation)", function () {
  let destinationToken: any;
  let distributor: any;
  let owner: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let eve: any;

  let merkleTree: any;
  const SNAPSHOT_BLOCK = 47461600;
  const CHAIN_ID = 84532;

  beforeEach(async function () {
    [owner, alice, bob, charlie, eve] = await ethers.getSigners();

    // 1. Deploy Destination Token (simulating future mainnet KC ERC-20)
    const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
    destinationToken = await KurdCoinFactory.deploy("Kurd Coin Mainnet", "KC", 10_000_000_000n);
    await destinationToken.waitForDeployment();

    // Grant MINTER_ROLE to owner so we can fund the distributor
    const MINTER_ROLE = await destinationToken.MINTER_ROLE();
    await destinationToken.grantRole(MINTER_ROLE, owner.address);

    // 2. Prepare Beta Snapshot Entitlements
    // 1 Beta KC = 1 Mainnet KC
    const entitlements = [
      { address: alice.address, amountKc: "10.0", amountWei: ethers.parseUnits("10.0", 18).toString() },
      { address: bob.address, amountKc: "25.5", amountWei: ethers.parseUnits("25.5", 18).toString() },
      { address: charlie.address, amountKc: "5.25", amountWei: ethers.parseUnits("5.25", 18).toString() }
    ];

    merkleTree = createEntitlementMerkleTree(entitlements);

    // 3. Deploy Migration Distributor with Merkle Root
    const DistributorFactory = await ethers.getContractFactory("KurdCoinMigrationDistributor");
    distributor = await DistributorFactory.deploy(
      await destinationToken.getAddress(),
      merkleTree.root,
      SNAPSHOT_BLOCK,
      CHAIN_ID
    );
    await distributor.waitForDeployment();

    // 4. Fund Distributor with 40.75 KC total
    const totalRequired = ethers.parseUnits("40.75", 18);
    await destinationToken.mint(await distributor.getAddress(), totalRequired);
  });

  it("1. Correctly verifies contract deployment and initial state", async function () {
    expect(await distributor.merkleRoot()).to.equal(merkleTree.root);
    expect(await distributor.snapshotBlock()).to.equal(SNAPSHOT_BLOCK);
    expect(await distributor.sourceChainId()).to.equal(CHAIN_ID);
    expect(await destinationToken.balanceOf(await distributor.getAddress())).to.equal(
      ethers.parseUnits("40.75", 18)
    );
  });

  it("2. Allows eligible user (Alice) to claim 1:1 mainnet tokens with valid Merkle proof", async function () {
    const aliceData = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === alice.address.toLowerCase())!;
    const aliceProof = aliceData.proof;

    expect(await destinationToken.balanceOf(alice.address)).to.equal(0n);
    expect(await distributor.isClaimed(aliceData.index)).to.equal(false);

    // Claim
    await expect(
      distributor.connect(alice).claimMigration(
        aliceData.index,
        alice.address,
        aliceData.amountWei,
        aliceProof
      )
    )
      .to.emit(distributor, "MigrationClaimed")
      .withArgs(aliceData.index, alice.address, aliceData.amountWei);

    // Balance should be exactly 10.0 KC
    expect(await destinationToken.balanceOf(alice.address)).to.equal(ethers.parseUnits("10.0", 18));
    expect(await distributor.isClaimed(aliceData.index)).to.equal(true);
  });

  it("3. Strictly REJECTS double claiming (Alice cannot claim twice)", async function () {
    const aliceData = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === alice.address.toLowerCase())!;
    const aliceProof = aliceData.proof;

    // First claim succeeds
    await distributor.connect(alice).claimMigration(
      aliceData.index,
      alice.address,
      aliceData.amountWei,
      aliceProof
    );

    // Second claim must revert
    await expect(
      distributor.connect(alice).claimMigration(
        aliceData.index,
        alice.address,
        aliceData.amountWei,
        aliceProof
      )
    ).to.be.revertedWith("Migration already claimed");
  });

  it("4. Strictly REJECTS tampered proof or unauthorized recipient", async function () {
    const aliceData = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === alice.address.toLowerCase())!;
    
    // Eve tries to claim using Alice's proof but sending to Eve's address
    await expect(
      distributor.connect(eve).claimMigration(
        aliceData.index,
        eve.address, // Tampered recipient
        aliceData.amountWei,
        aliceData.proof
      )
    ).to.be.revertedWith("Invalid Merkle proof");

    // Eve tries to claim inflated amount
    await expect(
      distributor.connect(alice).claimMigration(
        aliceData.index,
        alice.address,
        ethers.parseUnits("1000.0", 18), // Inflated amount
        aliceData.proof
      )
    ).to.be.revertedWith("Invalid Merkle proof");
  });

  it("5. Multiple independent users (Alice & Bob) can each claim once", async function () {
    const aliceData = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === alice.address.toLowerCase())!;
    const bobData = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === bob.address.toLowerCase())!;

    await distributor.connect(alice).claimMigration(
      aliceData.index,
      alice.address,
      aliceData.amountWei,
      aliceData.proof
    );

    await distributor.connect(bob).claimMigration(
      bobData.index,
      bob.address,
      bobData.amountWei,
      bobData.proof
    );

    expect(await destinationToken.balanceOf(alice.address)).to.equal(ethers.parseUnits("10.0", 18));
    expect(await destinationToken.balanceOf(bob.address)).to.equal(ethers.parseUnits("25.5", 18));
  });

  it("6. Emergency pause halts claims and unpause restores them", async function () {
    const charlieData = merkleTree.manifest.find((m: any) => m.address.toLowerCase() === charlie.address.toLowerCase())!;

    // Owner pauses
    await distributor.connect(owner).pause();

    await expect(
      distributor.connect(charlie).claimMigration(
        charlieData.index,
        charlie.address,
        charlieData.amountWei,
        charlieData.proof
      )
    ).to.be.revertedWithCustomError(distributor, "EnforcedPause");

    // Owner unpauses
    await distributor.connect(owner).unpause();

    await expect(
      distributor.connect(charlie).claimMigration(
        charlieData.index,
        charlie.address,
        charlieData.amountWei,
        charlieData.proof
      )
    ).to.emit(distributor, "MigrationClaimed");

    expect(await destinationToken.balanceOf(charlie.address)).to.equal(ethers.parseUnits("5.25", 18));
  });
});

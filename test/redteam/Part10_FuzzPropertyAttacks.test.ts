import { expect } from "chai";
import { ethers } from "hardhat";
import { createEntitlementMerkleTree } from "../merkleTreeHelper";

describe("KURD COIN — RED TEAM PART 10: FUZZ & PROPERTY-BASED INVARIANT TESTING", function () {
  let kurdCoin: any;
  let minter: any;
  let user1: any;
  let user2: any;
  let pauser: any;

  const MAX_SUPPLY_UNITS = 10_000_000_000n; // 10 Billion
  const DECIMALS = 18n;
  const CAP_WEI = MAX_SUPPLY_UNITS * (10n ** DECIMALS);

  beforeEach(async function () {
    const [, _minter, _user1, _user2, _pauser] = await ethers.getSigners();
    minter = _minter;
    user1 = _user1;
    user2 = _user2;
    pauser = _pauser;

    const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
    kurdCoin = await KurdCoinFactory.deploy("Kurd Coin", "KC", MAX_SUPPLY_UNITS);
    await kurdCoin.waitForDeployment();

    const MINTER_ROLE = await kurdCoin.MINTER_ROLE();
    const PAUSER_ROLE = await kurdCoin.PAUSER_ROLE();
    await kurdCoin.grantRole(MINTER_ROLE, minter.address);
    await kurdCoin.grantRole(PAUSER_ROLE, pauser.address);
  });

  it("PROPERTY 10.1: Conservation of totalMinted under arbitrary randomized mint/burn sequences", async function () {
    let expectedTotalMinted = 0n;
    let expectedTotalSupply = 0n;

    // Run 25 randomized iterations of minting and burning
    for (let i = 0; i < 25; i++) {
      const randomSeed = BigInt((i * 7919 + 104729) % 1000000);
      const mintAmount = ethers.parseEther((randomSeed + 1n).toString());

      // If within remaining cap, mint
      if (expectedTotalMinted + mintAmount <= CAP_WEI) {
        await kurdCoin.connect(minter).mint(user1.address, mintAmount);
        expectedTotalMinted += mintAmount;
        expectedTotalSupply += mintAmount;

        expect(await kurdCoin.totalMinted()).to.equal(expectedTotalMinted);
        expect(await kurdCoin.totalSupply()).to.equal(expectedTotalSupply);
      }

      // Randomly burn a fraction if user has balance
      if (expectedTotalSupply > 0n && i % 2 === 0) {
        const burnAmount = mintAmount / 2n;
        if (burnAmount > 0n && (await kurdCoin.balanceOf(user1.address)) >= burnAmount) {
          await kurdCoin.connect(user1).burn(burnAmount);
          expectedTotalSupply -= burnAmount;

          // Crucial Invariant: totalMinted DOES NOT DECREASE
          expect(await kurdCoin.totalMinted()).to.equal(expectedTotalMinted);
          expect(await kurdCoin.totalSupply()).to.equal(expectedTotalSupply);
        }
      }
    }

    // Assert final invariant: totalMinted <= cap
    expect(await kurdCoin.totalMinted()).to.be.lte(CAP_WEI);
  });

  it("PROPERTY 10.2: Merkle Tree claim-once property across 20 generated unique recipients", async function () {
    const entitlements: { address: string; amountKc: string; amountWei: string }[] = [];
    let totalEntitlement = 0n;

    for (let i = 0; i < 20; i++) {
      const wallet = ethers.Wallet.createRandom();
      const amount = ethers.parseEther((i + 1).toString());
      entitlements.push({
        address: wallet.address,
        amountKc: (i + 1).toString(),
        amountWei: amount.toString()
      });
      totalEntitlement += amount;
    }

    const tree = createEntitlementMerkleTree(entitlements);

    const DistributorFactory = await ethers.getContractFactory("KurdCoinMigrationDistributor");
    const distributor = await DistributorFactory.deploy(
      await kurdCoin.getAddress(),
      tree.root,
      47462000,
      84532
    );
    await distributor.waitForDeployment();

    // Fund distributor
    await kurdCoin.connect(minter).mint(await distributor.getAddress(), totalEntitlement);

    // Verify claim-once property on first 5 accounts
    for (let i = 0; i < 5; i++) {
      const item = tree.manifest[i];

      expect(await distributor.isClaimed(item.index)).to.be.false;

      // Claim succeeds
      await distributor.claimMigration(item.index, item.address, BigInt(item.amountWei), item.proof);

      expect(await distributor.isClaimed(item.index)).to.be.true;
      expect(await kurdCoin.balanceOf(item.address)).to.equal(BigInt(item.amountWei));

      // Subsequent claim must fail
      await expect(
        distributor.claimMigration(item.index, item.address, BigInt(item.amountWei), item.proof)
      ).to.be.revertedWith("Migration already claimed");
    }
  });

  it("PROPERTY 10.3: Rapid toggling of pause/unpause preserves invariant state", async function () {
    for (let i = 0; i < 5; i++) {
      await kurdCoin.connect(pauser).pause();
      expect(await kurdCoin.paused()).to.be.true;

      // Transfer must fail while paused
      await expect(
        kurdCoin.connect(user1).transfer(user2.address, 100n)
      ).to.be.revertedWithCustomError(kurdCoin, "EnforcedPause");

      await kurdCoin.connect(pauser).unpause();
      expect(await kurdCoin.paused()).to.be.false;
    }
  });
});

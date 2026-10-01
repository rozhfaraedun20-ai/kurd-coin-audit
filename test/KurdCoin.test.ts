import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { KurdCoin } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Provisional simulation cap: 10 billion KC (10_000_000_000)
const TOKEN_NAME = "Kurd Coin";
const TOKEN_SYMBOL = "KC";
const PROVISIONAL_MAX_SUPPLY = 10_000_000_000n;
const PROVISIONAL_MAX_SUPPLY_WEI = ethers.parseEther(PROVISIONAL_MAX_SUPPLY.toString());

describe("KurdCoin ERC-20 Security Audit & Invariants", function () {
  let kc: KurdCoin;
  let admin: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let pauser: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;

  let MINTER_ROLE: string;
  let PAUSER_ROLE: string;
  let DEFAULT_ADMIN_ROLE: string;

  beforeEach(async () => {
    [admin, minter, pauser, user, recipient, attacker] = await ethers.getSigners();

    const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
    kc = await KurdCoinFactory.deploy(TOKEN_NAME, TOKEN_SYMBOL, PROVISIONAL_MAX_SUPPLY);

    MINTER_ROLE = await kc.MINTER_ROLE();
    PAUSER_ROLE = await kc.PAUSER_ROLE();
    DEFAULT_ADMIN_ROLE = await kc.DEFAULT_ADMIN_ROLE();

    // Grant roles: separation of duties
    await kc.connect(admin).grantRole(MINTER_ROLE, minter.address);
    await kc.connect(admin).grantRole(PAUSER_ROLE, pauser.address);
  });

  // ─── 1. Deployment & Constructor Invariants ─────────────────────────────────
  describe("Deployment & Invariants", () => {
    it("initializes with configured token name and symbol", async () => {
      expect(await kc.name()).to.equal(TOKEN_NAME);
      expect(await kc.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("has standard 18 decimals", async () => {
      expect(await kc.decimals()).to.equal(18n);
    });

    it("sets provisional 10 billion KC max supply cap", async () => {
      expect(await kc.cap()).to.equal(PROVISIONAL_MAX_SUPPLY_WEI);
    });

    it("starts with 0 total supply and 0 total minted", async () => {
      expect(await kc.totalSupply()).to.equal(0n);
      expect(await kc.totalMinted()).to.equal(0n);
    });

    it("grants DEFAULT_ADMIN_ROLE and PAUSER_ROLE to deployer", async () => {
      expect(await kc.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await kc.hasRole(PAUSER_ROLE, admin.address)).to.be.true;
    });

    it("does NOT grant MINTER_ROLE to deployer in constructor", async () => {
      const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
      const fresh = await KurdCoinFactory.connect(admin).deploy(TOKEN_NAME, TOKEN_SYMBOL, PROVISIONAL_MAX_SUPPLY);
      expect(await fresh.hasRole(MINTER_ROLE, admin.address)).to.be.false;
    });

    it("reverts deployment if maxSupply is 0", async () => {
      const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
      await expect(
        KurdCoinFactory.deploy(TOKEN_NAME, TOKEN_SYMBOL, 0n)
      ).to.be.revertedWithCustomError(KurdCoinFactory, "ERC20InvalidCap");
    });

    it("reverts deployment if name or symbol is empty", async () => {
      const KurdCoinFactory = await ethers.getContractFactory("KurdCoin");
      await expect(
        KurdCoinFactory.deploy("", TOKEN_SYMBOL, PROVISIONAL_MAX_SUPPLY)
      ).to.be.revertedWith("KurdCoin: name cannot be empty");
      await expect(
        KurdCoinFactory.deploy(TOKEN_NAME, "", PROVISIONAL_MAX_SUPPLY)
      ).to.be.revertedWith("KurdCoin: symbol cannot be empty");
    });
  });

  // ─── 2. Minting Authorization & Boundary Checks ─────────────────────────────
  describe("Mint Authorization & Boundary Checks", () => {
    it("allows MINTER_ROLE to mint within cap", async () => {
      const amount = ethers.parseEther("5000");
      await kc.connect(minter).mint(user.address, amount);
      expect(await kc.balanceOf(user.address)).to.equal(amount);
      expect(await kc.totalMinted()).to.equal(amount);
    });

    it("reverts if non-minter attempts direct mint", async () => {
      const amount = ethers.parseEther("1000");
      await expect(
        kc.connect(attacker).mint(user.address, amount)
      ).to.be.revertedWithCustomError(kc, "AccessControlUnauthorizedAccount");
    });

    it("reverts if minting to address(0)", async () => {
      await expect(
        kc.connect(minter).mint(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWith("KurdCoin: mint to zero address");
    });

    it("reverts if minting 0 tokens", async () => {
      await expect(
        kc.connect(minter).mint(user.address, 0n)
      ).to.be.revertedWith("KurdCoin: amount must be > 0");
    });

    it("reverts if mint exceeds the 10B lifetime cap", async () => {
      const overCap = PROVISIONAL_MAX_SUPPLY_WEI + 1n;
      await expect(
        kc.connect(minter).mint(user.address, overCap)
      ).to.be.revertedWith("KurdCoin: total minted exceeds cap");
    });

    it("can mint exactly up to the 10B cap", async () => {
      await kc.connect(minter).mint(user.address, PROVISIONAL_MAX_SUPPLY_WEI);
      expect(await kc.totalSupply()).to.equal(PROVISIONAL_MAX_SUPPLY_WEI);
      expect(await kc.totalMinted()).to.equal(PROVISIONAL_MAX_SUPPLY_WEI);
    });
  });

  // ─── 3. Lifetime Cap vs Burn Invariant ──────────────────────────────────────
  describe("Lifetime Cap vs Burn Invariant", () => {
    it("burning reduces totalSupply but preserves totalMinted invariant", async () => {
      const mintAmount = ethers.parseEther("1000");
      await kc.connect(minter).mint(user.address, mintAmount);

      const burnAmount = ethers.parseEther("200");
      await kc.connect(user).burn(burnAmount);

      expect(await kc.balanceOf(user.address)).to.equal(ethers.parseEther("800"));
      expect(await kc.totalSupply()).to.equal(ethers.parseEther("800"));
      // totalMinted remains at 1000!
      expect(await kc.totalMinted()).to.equal(mintAmount);
    });

    it("does NOT permit reminting burned tokens past the 10B lifetime cap", async () => {
      // 1. Mint entire 10B supply
      await kc.connect(minter).mint(user.address, PROVISIONAL_MAX_SUPPLY_WEI);

      // 2. User burns 1000 KC
      await kc.connect(user).burn(ethers.parseEther("1000"));

      // 3. Even though totalSupply is 9,999,999,000 KC, totalMinted is 10B.
      // Attempting to re-mint even 1 wei must be blocked by the lifetime cap!
      await expect(
        kc.connect(minter).mint(user.address, 1n)
      ).to.be.revertedWith("KurdCoin: total minted exceeds cap");
    });
  });

  // ─── 4. EIP-712 Replay-Proof Claim Authorization ────────────────────────────
  describe("EIP-712 Claim Authorization", () => {
    async function signClaim(
      signer: HardhatEthersSigner,
      to: string,
      amount: bigint,
      nonce: bigint,
      deadline: number
    ): Promise<string> {
      const domain = {
        name: TOKEN_NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await kc.getAddress(),
      };
      const types = {
        Claim: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = { to, amount, nonce, deadline };
      return signer.signTypedData(domain, types, value);
    }

    it("successfully claims with a valid MINTER_ROLE signature", async () => {
      const amount = ethers.parseEther("50");
      const deadline = (await time.latest()) + 3600;
      const nonce = await kc.claimNonces(user.address);

      const sig = await signClaim(minter, user.address, amount, nonce, deadline);
      await expect(
        kc.connect(user).claimWithAuthorization(user.address, amount, nonce, deadline, sig)
      ).to.emit(kc, "ClaimExecuted");

      expect(await kc.balanceOf(user.address)).to.equal(amount);
      expect(await kc.claimNonces(user.address)).to.equal(nonce + 1n);
      expect(await kc.totalMinted()).to.equal(amount);
    });

    it("prevents replay attacks: cannot use the same signature twice", async () => {
      const amount = ethers.parseEther("25");
      const deadline = (await time.latest()) + 3600;
      const nonce = await kc.claimNonces(user.address);

      const sig = await signClaim(minter, user.address, amount, nonce, deadline);
      await kc.claimWithAuthorization(user.address, amount, nonce, deadline, sig);

      // Replay attempt with same parameters and signature
      await expect(
        kc.claimWithAuthorization(user.address, amount, nonce, deadline, sig)
      ).to.be.revertedWith("KurdCoin: invalid nonce");
    });

    it("reverts if deadline has expired", async () => {
      const amount = ethers.parseEther("10");
      const pastDeadline = (await time.latest()) - 10;
      const nonce = await kc.claimNonces(user.address);

      const sig = await signClaim(minter, user.address, amount, nonce, pastDeadline);
      await expect(
        kc.claimWithAuthorization(user.address, amount, nonce, pastDeadline, sig)
      ).to.be.revertedWith("KurdCoin: authorization expired");
    });

    it("reverts if signed by an unauthorized key (attacker)", async () => {
      const amount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;
      const nonce = await kc.claimNonces(user.address);

      const fraudulentSig = await signClaim(attacker, user.address, amount, nonce, deadline);
      await expect(
        kc.claimWithAuthorization(user.address, amount, nonce, deadline, fraudulentSig)
      ).to.be.revertedWith("KurdCoin: signer is not a minter");
    });

    it("reverts if recipient is address(0)", async () => {
      const amount = ethers.parseEther("10");
      const deadline = (await time.latest()) + 3600;
      const nonce = 0n;

      const sig = await signClaim(minter, ethers.ZeroAddress, amount, nonce, deadline);
      await expect(
        kc.claimWithAuthorization(ethers.ZeroAddress, amount, nonce, deadline, sig)
      ).to.be.revertedWith("KurdCoin: claim to zero address");
    });

    it("reverts if amount is 0", async () => {
      const deadline = (await time.latest()) + 3600;
      const nonce = await kc.claimNonces(user.address);

      const sig = await signClaim(minter, user.address, 0n, nonce, deadline);
      await expect(
        kc.claimWithAuthorization(user.address, 0n, nonce, deadline, sig)
      ).to.be.revertedWith("KurdCoin: amount must be > 0");
    });

    it("reverts if signature was for a different recipient (tampering defense)", async () => {
      const amount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;
      const nonce = await kc.claimNonces(user.address);

      // Signed for user.address
      const sig = await signClaim(minter, user.address, amount, nonce, deadline);

      // Submitted for recipient.address
      await expect(
        kc.claimWithAuthorization(recipient.address, amount, 0n, deadline, sig)
      ).to.be.revertedWith("KurdCoin: signer is not a minter");
    });
  });

  // ─── 5. Emergency Pause / Unpause ───────────────────────────────────────────
  describe("Emergency Pause & Circuit Breaker", () => {
    it("allows PAUSER_ROLE to pause and blocks transfers and mints", async () => {
      await kc.connect(minter).mint(user.address, ethers.parseEther("100"));
      await kc.connect(pauser).pause();

      // Transfers blocked
      await expect(
        kc.connect(user).transfer(recipient.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(kc, "EnforcedPause");

      // Mints blocked
      await expect(
        kc.connect(minter).mint(user.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(kc, "EnforcedPause");

      // Claims blocked
      const deadline = (await time.latest()) + 3600;
      const nonce = await kc.claimNonces(user.address);
      const domain = {
        name: TOKEN_NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await kc.getAddress(),
      };
      const types = {
        Claim: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await minter.signTypedData(domain, types, {
        to: user.address,
        amount: ethers.parseEther("10"),
        nonce,
        deadline,
      });

      await expect(
        kc.claimWithAuthorization(user.address, ethers.parseEther("10"), nonce, deadline, sig)
      ).to.be.revertedWithCustomError(kc, "EnforcedPause");
    });

    it("allows PAUSER_ROLE to unpause and resume operations", async () => {
      await kc.connect(minter).mint(user.address, ethers.parseEther("100"));
      await kc.connect(pauser).pause();
      await kc.connect(pauser).unpause();

      await expect(
        kc.connect(user).transfer(recipient.address, ethers.parseEther("10"))
      ).to.not.be.reverted;

      expect(await kc.balanceOf(recipient.address)).to.equal(ethers.parseEther("10"));
    });

    it("reverts if non-pauser attempts to pause", async () => {
      await expect(
        kc.connect(attacker).pause()
      ).to.be.revertedWithCustomError(kc, "AccessControlUnauthorizedAccount");
    });
  });

  // ─── 6. Standard ERC-20 Compatibility (DEX & CEX ready) ─────────────────────
  describe("Standard ERC-20 Compatibility", () => {
    it("handles approve and transferFrom correctly", async () => {
      const amount = ethers.parseEther("500");
      await kc.connect(minter).mint(user.address, amount);

      // User approves recipient to spend 200 KC
      await kc.connect(user).approve(recipient.address, ethers.parseEther("200"));
      expect(await kc.allowance(user.address, recipient.address)).to.equal(ethers.parseEther("200"));

      // Recipient transfers 150 KC from user to attacker
      await kc.connect(recipient).transferFrom(user.address, attacker.address, ethers.parseEther("150"));
      expect(await kc.balanceOf(attacker.address)).to.equal(ethers.parseEther("150"));
      expect(await kc.balanceOf(user.address)).to.equal(ethers.parseEther("350"));
      expect(await kc.allowance(user.address, recipient.address)).to.equal(ethers.parseEther("50"));
    });

    it("has 0 transfer tax (100% of sent tokens arrive at destination)", async () => {
      const amount = ethers.parseEther("100");
      await kc.connect(minter).mint(user.address, amount);

      const beforeBalance = await kc.balanceOf(recipient.address);
      await kc.connect(user).transfer(recipient.address, amount);
      const afterBalance = await kc.balanceOf(recipient.address);

      expect(afterBalance - beforeBalance).to.equal(amount);
    });
  });
});

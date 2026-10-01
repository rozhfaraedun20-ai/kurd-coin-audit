# KURD COIN — COMPREHENSIVE THREAT MODEL

**Methodology:** STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)  
**Evaluation Target:** Base Sepolia Testnet Beta & Production Candidate Smart Contracts  

---

## 1. SMART CONTRACT THREAT VECTORS

| Threat ID | Threat Vector | Impact | Likelihood | Current Mitigation | Remaining Risk |
|---|---|---|---|---|---|
| **SC-01** | **Admin-Key Compromise (Deployer EOA)** | **CRITICAL** | Medium (Testnet) / Low (Mainnet) | Phase 10 verified full 7-step handover of `DEFAULT_ADMIN_ROLE` from deployer EOA to 3-of-5 Gnosis Safe Multisig + TimelockController. | Risk remains during testnet until mainnet contract is deployed with multisig admin from block 0. |
| **SC-02** | **Minter Key Compromise** | **HIGH** | Low | Minting is strictly bounded by `totalMinted <= cap()`. Even if minter key is compromised, total minted KC cannot exceed 10 Billion KC. Mainnet migration distributor holds fixed allocation (no mint role). | Malicious minter could mint up to remaining headroom under cap before pause is activated. |
| **SC-03** | **Cap Bypass / Overflow** | **CRITICAL** | Negligible | Solidity 0.8.27 native overflow checks. Monotonic variable `totalMinted` explicitly checked against `cap()` on every mint call. | None identified; verified by unit and boundary tests. |
| **SC-04** | **Mint-After-Burn Supply Inflation** | **CRITICAL** | Negligible | Contract checks `totalMinted + amount <= cap()` rather than `totalSupply()`. Burning reduces circulating supply but leaves `totalMinted` invariant unchanged. | None; mathematically impossible to recycle burned capacity. |
| **SC-05** | **Reentrancy in Claims or Mints** | **HIGH** | Negligible | Strictly adheres to Checks-Effects-Interactions (CEI). Nonce increment (`claimNonces[to]++`) and `totalMinted += amount` occur before internal `_mint()`. Zero arbitrary external calls. | Standard ERC-20 token callbacks do not exist; reentrancy surface is zero. |
| **SC-06** | **EIP-712 Signature Replay** | **HIGH** | Low | Digest binds `to`, `amount`, `nonce`, `deadline`, and EIP-712 domain binds `chainId` and `verifyingContract`. Per-address sequential nonces prevent reuse across chains or transactions. | Expired signatures cannot be replayed; altered parameters invalidate cryptographic digest. |
| **SC-07** | **Malformed Merkle Proof Injection** | **HIGH** | Low | Uses OpenZeppelin `MerkleProof.verify` with canonical double-hashed leaves. Unclaimed leaf indices tracked in storage. | Proofs for non-existent leaves mathematically evaluate to non-matching root. |
| **SC-08** | **Double-Claiming Merkle Migration** | **HIGH** | Low | `KurdCoinMigrationDistributor.sol` maintains `_claimed[index]` state mapping. Second claim transaction strictly reverts. | None; tested and verified in Hardhat test suite. |
| **SC-09** | **Pause Bypass / Griefing** | **MEDIUM** | Low | `whenNotPaused` modifier enforced on `transfer()`, `transferFrom()`, `mint()`, and `claimWithAuthorization()`. `PAUSER_ROLE` granted only to Emergency Guardian. | Guardian key compromise allows freezing transfers until multisig unpauses. |

---

## 2. BACKEND & RELAYER THREAT VECTORS

| Threat ID | Threat Vector | Impact | Likelihood | Current Mitigation | Remaining Risk |
|---|---|---|---|---|---|
| **BE-01** | **Service-Role Key Leakage** | **CRITICAL** | Low | Automated AST scanner (`checkBundleSafety.mjs`) verifies 0 secrets in production bundle. Key stored solely in Supabase encrypted environment secrets. | Server infrastructure compromise could compromise database. |
| **BE-02** | **Gas Sponsorship Relayer Drainage** | **HIGH** | Medium (Testnet) / Low (Mainnet) | Edge Function enforces per-tx cap (0.00015 ETH), user daily cap (0.0005 ETH), 300s cooldown, and 0.05 ETH/24h global circuit breaker. Mainnet disables general transfer sponsorship entirely. | Attacker can exhaust 0.05 ETH daily budget on testnet via distributed accounts. |
| **BE-03** | **Concurrent Claim Race Conditions** | **MEDIUM** | Low | Database stored procedure `reserve_mining_claim_rpc` uses PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`) and unique session reward constraints. | Concurrent requests for the same user are serialized; duplicate claims revert. |
| **BE-04** | **Restricted / Blocked Account Exploitation** | **MEDIUM** | Low | Backend checks `risk_profiles.risk_status` prior to granting claims or gas sponsorships. Restricted and blocked users receive HTTP 403. | Adversary creating multiple fresh unflagged accounts until sybil score triggers. |

---

## 3. MIGRATION SUBSYSTEM THREAT VECTORS

| Threat ID | Threat Vector | Impact | Likelihood | Current Mitigation | Remaining Risk |
|---|---|---|---|---|---|
| **MG-01** | **Double-Counting (Mined vs Claimed)** | **HIGH** | Low | Entitlement formula strictly defines: $\text{Entitlement} = \text{On-chain KC} + \text{Unclaimed Claimable KC}$. Lifetime `mined_kc` and `claimed_kc` are never summed directly. | None; proven by 22/22 migration invariant tests. |
| **MG-02** | **QA / Test Balances in Migration Pool** | **HIGH** | Low | Database registry `public.migration_exclusions` explicitly tracks all 79 QA accounts, deployer bootstrap (100 KC), and zero address. `is_test_account = true` accounts are strictly excluded. | Manually misconfigured test accounts not flagged as test accounts could enter pool (mitigated by automated classification). |
| **MG-03** | **Snapshot Tampering Post-Finalization** | **HIGH** | Low | PostgreSQL database trigger `trg_enforce_snapshot_immutability` strictly aborts any `UPDATE` or `DELETE` once status is `'finalized'`. | Direct superuser DB access could alter raw table (mitigated by immutable on-chain Merkle root). |
| **MG-04** | **Unauthorized Destination Redirection** | **HIGH** | Low | Changing migration claim destination requires an EIP-191 signature signed by the source wallet private key. | If user loses source wallet key, they cannot redirect destination. |

---

## 4. CLIENT WALLET & VAULT THREAT VECTORS

| Threat ID | Threat Vector | Impact | Likelihood | Current Mitigation | Remaining Risk |
|---|---|---|---|---|---|
| **WL-01** | **Weak User Password / Brute Force** | **HIGH** | Medium | PBKDF2 with 100,000 iterations of HMAC-SHA-256 makes offline dictionary attacks computationally expensive. Password length constraints enforced on client. | User choosing an extremely weak dictionary password on a compromised device. |
| **WL-02** | **Cloud Ciphertext Theft** | **HIGH** | Low | Encrypted vault stored with authenticated AES-256-GCM (128-bit tag). Without user password, ciphertext is computationally unfeasible to decrypt. | Quantum computing advances against AES-256 / SHA-256 (long-term theoretical). |
| **WL-03** | **Client Device Compromise / Malware** | **CRITICAL** | Medium | Plaintext private keys exist only in ephemeral browser JavaScript memory while the wallet is unlocked. Auto-locks upon tab close or inactivity. | Malicious browser extension with DOM/memory reading capabilities. |
| **WL-04** | **Permanent Password Loss** | **HIGH** | Medium | User is guided to write down a 12-word BIP-39 mnemonic recovery phrase during onboarding. | User who fails to write down recovery phrase cannot recover wallet if password is forgotten. |

---

## 5. GOVERNANCE & PRIVILEGE THREAT VECTORS

| Threat ID | Threat Vector | Impact | Likelihood | Current Mitigation | Remaining Risk |
|---|---|---|---|---|---|
| **GV-01** | **Single Multisig Signer Key Compromise** | **HIGH** | Low | 3-of-5 threshold requires at least 3 independent key compromises before any proposal can execute. | Physical coercion of majority keyholders. |
| **GV-02** | **Timelock Bypass** | **CRITICAL** | Negligible | OpenZeppelin `TimelockController` delay enforced in contract bytecode; execution before delay strictly reverts. | Governance parameter reduction requires an advance proposal through the timelock itself. |
| **GV-03** | **Emergency Guardian Rogue Action** | **MEDIUM** | Low | Emergency Guardian holds **only** `PAUSER_ROLE`. It has zero minting rights, zero fund transfer rights, and zero admin rights. Unpausing requires multisig approval. | Rogue guardian can freeze contract temporarily until multisig removes role and unpauses. |

# KURD COIN — TRUST ASSUMPTIONS & CUSTODIAL BOUNDARIES

> **AUDITOR NOTE:** This document frankly defines the trust boundaries of Kurd Coin. The project avoids marketing claims of "absolute decentralization" where hybrid or centralized operational dependencies exist.

---

## 1. OFF-CHAIN ACCOUNTING & MINING ENGINE (CENTRALIZED)
- **Trust Assumption:** Users trust the Kurd Coin backend (Supabase PostgreSQL database and Edge Runtime) to accurately record mining sessions, calculate halving tiers, record referral bonuses, and enforce the 24-hour time barrier.
- **Why It Exists:** Daily micro-mining rewards (0.25 KC/24h) cannot be processed directly on Layer 1/Layer 2 block-by-block without incurring unviable operational gas overhead.
- **Mitigation & Boundary:** Off-chain balances are merely *claimable accounting vouchers*. Users only attain true self-custodial ownership once rewards are claimed and minted on-chain into their EVM wallet. Once tokens are on-chain, the Supabase backend cannot revoke, freeze, or alter user token balances.

## 2. PRIVILEGED BACKEND SERVICE ROLE (RESTRICTED PRIVILEGE)
- **Trust Assumption:** The Supabase `service_role` key possesses elevated privileges to execute `SECURITY DEFINER` stored procedures.
- **Mitigation & Boundary:**
  - Client connections utilize the unprivileged `anon` key. Direct writes to tables are blocked by Row Level Security (RLS) policies.
  - Stored procedures have pinned `search_path = public, pg_temp` to prevent SQL search-path injection.
  - The `service_role` key is restricted strictly to backend Edge Functions (`claim-mining-rewards`, `sponsor-gas`) and is never shipped in frontend bundles.

## 3. MIGRATION SNAPSHOT & MERKLE ROOT GENERATION
- **Trust Assumption:** Users trust the core team to execute `generateMigrationSnapshot.ts` faithfully at the announced block height and publish the authentic Merkle root.
- **Mitigation & Boundary:**
  - The snapshot process is 100% reproducible. Anyone can independently query the Base Sepolia blockchain at the cut-off block height and run `reconcileMigrationSnapshot.ts` to verify the mathematical root hash.
  - Once the snapshot is set to `finalized` in PostgreSQL, an immutable trigger (`trg_enforce_snapshot_immutability`) permanently blocks all updates or deletions to entitlement rows.

## 4. CLIENT-SIDE ENCRYPTED VAULT (HYBRID CUSTODY)
- **Trust Assumption:** The security of the user's built-in EVM wallet relies on:
  1. The entropy of the client's Web Cryptography API (`crypto.getRandomValues`).
  2. The strength of the user's chosen master password.
  3. The security of the user's local operating system and browser environment (absence of keyloggers/malware).
- **Mitigation & Boundary:**
  - The server stores only ciphertext encrypted with AES-256-GCM and derived via PBKDF2 (100,000 iterations).
  - The server possesses zero knowledge of the master password or private key.
  - Users are prompted to write down an offline paper recovery phrase (BIP-39 mnemonic) for independent hardware/external wallet restoration.

## 5. RELAYER SIGNER PRIVILEGES (MINTER_ROLE ON TESTNET)
- **Trust Assumption:** On Base Sepolia testnet, the server relayer (`0x0F79F4...`) holds `MINTER_ROLE` to sign and submit EIP-712 claims.
- **Future Mainnet Shift:** On Base Mainnet, ongoing mining settlement will either utilize a pre-allocated mining reserve contract or a timelocked minter. For migration claims, the `KurdCoinMigrationDistributor` contract will hold a fixed allocation of pre-minted tokens and will **NOT** possess open minting authority.

## 6. GAS SPONSORSHIP RELAYER (FINANCIAL EXPOSURE ONLY)
- **Trust Assumption:** Users trust the gas sponsor relayer (`0xD072F5...`) to broadcast gas sponsorships when eligible.
- **Mitigation & Boundary:** The gas sponsor relayer holds **zero token privileges** on the smart contract. A failure or compromise of the gas relayer affects only the project's gas treasury, not user token balances or contract permissions.

## 7. MULTISIG GOVERNANCE & HUMAN KEYHOLDERS
- **Trust Assumption:** Token holders trust that the threshold signers of the 3-of-5 Gnosis Safe multisig act honestly and maintain physical security of their hardware keys.
- **Mitigation & Boundary:** The OpenZeppelin `TimelockController` enforces a 24-to-48-hour execution delay on all administrative proposals. This gives the community advance notice of any upcoming changes before they take effect.

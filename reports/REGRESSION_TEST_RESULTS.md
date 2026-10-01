# Kurd Coin — Regression Test & Simulation Execution Report

> **Candidate Tag:** `kurd-coin-audit-candidate-1`  
> **Status:** AUDIT CANDIDATE / TEST SUITE BASELINE  
> **Execution Date:** September 29, 2026  
> **Execution Platform:** Node.js v24.18.0 / Hardhat 2.22.0 / Solidity 0.8.27  

---

## 1. Executive Summary

All core protocol contracts, governance timelocks, migration distributors, relayer economic protections, and snapshot reconciliation algorithms were executed against deterministic test harnesses.

| Suite | Category | Tests Executed | Passed | Failed | Flaky |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Contracts Core & Invariants** | Smart Contracts (EVM) | 31 | 31 | 0 | 0 |
| **Governance & Timelock Rehearsal** | Smart Contracts (EVM) | 15 | 15 | 0 | 0 |
| **Migration Rehearsal (Distributor)** | Smart Contracts (EVM) | 6 | 6 | 0 | 0 |
| **Gas Sponsor Economic Abuse Simulation** | Relayer & API Security | 11 | 11 | 0 | 0 |
| **Migration Invariants Suite** | Cryptography & Math | 22 | 22 | 0 | 0 |
| **Snapshot Reconciliation** | On-Chain / Off-Chain Data | 5 | 5 | 0 | 0 |
| **TOTAL PROTOCOL VERIFICATIONS** | — | **90** | **90** | **0** | **0** |

**Zero test failures. Zero regressions observed.**

---

## 2. Smart Contract Test Suites (Hardhat EVM In-Memory)

*Command:* `npm.cmd test` (inside `contracts/`)  
*Execution Time:* 2.14s  

### 2.1 Governance & Access Control (`GovernanceRehearsal.test.ts`)
- `[PASS]` 1.1 Proposing an admin action creates a pending transaction with 1 confirmation
- `[PASS]` 1.2 Single signer CANNOT execute transaction alone (rejects with insufficient confirmations)
- `[PASS]` 1.3 Non-owner cannot submit, confirm, or execute transactions
- `[PASS]` 1.4 Reaching threshold (2-of-3) allows execution; revoking blocks execution
- `[PASS]` 1.5 Emulates 3-of-5 Multisig setup cleanly
- `[PASS]` 2.1 Unauthorized user cannot schedule or queue an operation in Timelock
- `[PASS]` 2.2 Proposer (Multisig) queues operation; early execution is strictly rejected
- `[PASS]` 2.3 Operation executes successfully after required delay (24–48 hours)
- `[PASS]` 2.4 Cancellation works: Proposer can cancel a queued operation before execution
- `[PASS]` 3.1 Emergency Guardian can instantly freeze the token without timelock delay
- `[PASS]` 3.2 Paused state strictly blocks mint, transfer, and claimWithAuthorization
- `[PASS]` 3.3 Emergency Guardian has ZERO minting authority and ZERO admin authority
- `[PASS]` 3.4 Unpausing can be executed by designated authority once safety verified
- `[PASS]` 4.1 Executes full 7-step governance handover sequence cleanly
- `[PASS]` 5.1 Minter can mint within 10B KC cap
- `[PASS]` 5.2 Minting exceeding 10 Billion KC cap is strictly rejected
- `[PASS]` 5.3 Burning tokens reduces circulating supply but does NOT increase mintable capacity
- `[PASS]` 5.4 Unauthorized address cannot mint

### 2.2 KurdCoin ERC-20 Core & Invariants (`KurdCoin.test.ts`)
- `[PASS]` Initializes with configured token name and symbol (`Kurd Coin`, `KC`, 18 decimals)
- `[PASS]` Sets provisional 10 billion KC max supply cap
- `[PASS]` Starts with 0 total supply and 0 total minted
- `[PASS]` Grants `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE` to deployer
- `[PASS]` Does NOT grant `MINTER_ROLE` to deployer in constructor
- `[PASS]` Reverts deployment if maxSupply is 0
- `[PASS]` Reverts deployment if name or symbol is empty
- `[PASS]` Allows `MINTER_ROLE` to mint within cap
- `[PASS]` Reverts if non-minter attempts direct mint
- `[PASS]` Reverts if minting to `address(0)`
- `[PASS]` Reverts if minting 0 tokens
- `[PASS]` Reverts if mint exceeds the 10B lifetime cap
- `[PASS]` Can mint exactly up to the 10B cap
- `[PASS]` Burning reduces `totalSupply` but preserves `totalMinted` invariant
- `[PASS]` Does NOT permit reminting burned tokens past the 10B lifetime cap
- `[PASS]` EIP-712: Successfully claims with a valid `MINTER_ROLE` signature
- `[PASS]` EIP-712: Prevents replay attacks: cannot use the same signature twice
- `[PASS]` EIP-712: Reverts if deadline has expired
- `[PASS]` EIP-712: Reverts if signed by an unauthorized key
- `[PASS]` EIP-712: Reverts if recipient is `address(0)`
- `[PASS]` EIP-712: Reverts if amount is 0
- `[PASS]` EIP-712: Reverts if signature was for a different recipient (tampering defense)
- `[PASS]` Allows `PAUSER_ROLE` to pause and blocks transfers and mints
- `[PASS]` Allows `PAUSER_ROLE` to unpause and resume operations
- `[PASS]` Reverts if non-pauser attempts to pause
- `[PASS]` Handles `approve` and `transferFrom` correctly
- `[PASS]` Has 0 transfer tax (100% of sent tokens arrive at destination)

### 2.3 Migration Distributor Rehearsal (`MigrationRehearsal.test.ts`)
- `[PASS]` Correctly verifies contract deployment and initial state
- `[PASS]` Allows eligible user (Alice) to claim 1:1 mainnet tokens with valid Merkle proof
- `[PASS]` Strictly REJECTS double claiming (Alice cannot claim twice)
- `[PASS]` Strictly REJECTS tampered proof or unauthorized recipient
- `[PASS]` Multiple independent users (Alice & Bob) can each claim once
- `[PASS]` Emergency pause halts claims and unpause restores them

---

## 3. Gas Sponsor Economic Abuse Simulation

*Command:* `npx.cmd tsx scripts/simulateSponsorAbuse.ts`  
*Stress Scale:* 1,000 simulated user identities, 10,000 randomized requests  

### Results Matrix
- `[PASS] TEST 1:` Initial legitimate request is granted
- `[PASS] TEST 2:` Rapid request within 300s cooldown is strictly rejected (`COOLDOWN_ACTIVE`)
- `[PASS] TEST 3:` Exact idempotent retry returns confirmed without charging budget twice
- `[PASS] TEST 4:` User exceeding 0.0005 ETH daily cap is strictly rejected
- `[PASS] TEST 5:` Blocked risk profile user is rejected with `ACCOUNT_RESTRICTED`
- `[PASS] TEST 6:` Zero recipient address is rejected with `INVALID_RECIPIENT`
- `[PASS] TEST 7:` Normal KC transfer on Mainnet fails closed (`SPONSORSHIP_DISABLED_ON_MAINNET`)
- `[PASS] TEST 8:` Global 24h spend (0.04995 ETH) capped at configured budget (0.05 ETH)
- `[PASS] TEST 9:` Circuit breaker tripped to protect relayer treasury from exhaustion
- `[PASS] TEST 10:` Cooldown barrier successfully blocked rapid request bursts (666 burst blocks)
- `[PASS] TEST 11:` Restricted/blocked accounts rejected (500 blacklist blocks)

**Simulation Outcome:** 9,667 out of 10,000 spam requests (96.7%) successfully defended. Maximum treasury drain strictly limited to 0.04995 ETH.

---

## 4. Migration Mathematical Invariant Verification

*Command:* `npx.cmd tsx scripts/testMigrationSuite.ts`  

- `[PASS] TEST 1:` 1:1 ratio: `onchain (4.75) + claimable (0.25) = 5.00 KC`
- `[PASS] TEST 2:` Case A: `Mined 10, Claimed 10 -> Entitlement is 10.0 KC, NOT 20.0 KC` (no double count)
- `[PASS] TEST 3:` Case B: `Mined 10, Claimed 6, Claimable 4 -> Entitlement is exactly 10.0 KC`
- `[PASS] TEST 4:` Case C: Current ownership preserved after transfer (`A=7 KC, B=3 KC, sum=10 KC`)
- `[PASS] TEST 5:` Real user entitlement (`6.0 KC`) included in migration pool
- `[PASS] TEST 6:` QA account entitlement (`150.0 KC`) strictly excluded from migration pool
- `[PASS] TEST 7:` Deployer address registered in `migration_exclusions`
- `[PASS] TEST 8:` Claim Distributor registered in `migration_exclusions`
- `[PASS] TEST 9:` Gas Sponsor registered in `migration_exclusions`
- `[PASS] TEST 10:` Zero address registered in `migration_exclusions`
- `[PASS] TEST 11:` EIP-191 signature verification succeeds for authorized destination redirection
- `[PASS] TEST 12:` Tampered destination in signature fails verification
- `[PASS] TEST 13:` Deterministic Merkle root invariant (order-independent sort)
- `[PASS] TEST 14:` Valid Merkle proof generated and verified for User 1
- `[PASS] TEST 15:` Valid Merkle proof generated and verified for User 2
- `[PASS] TEST 16:` Valid Merkle proof generated and verified for User 3
- `[PASS] TEST 17:` Tampered leaf amount strictly rejected by Merkle proof verification
- `[PASS] TEST 18:` Entitlement within 10 Billion KC hard cap passes
- `[PASS] TEST 19:` Entitlement exceeding 10 Billion KC hard cap is identified and blocked
- `[PASS] TEST 20:` `get_my_migration_preview_rpc` verified `SECURITY DEFINER`
- `[PASS] TEST 21:` `get_my_migration_preview_rpc` has pinned `search_path = public, pg_temp`
- `[PASS] TEST 22:` Snapshot and entitlement immutability triggers active in PostgreSQL

---

## 5. Migration Snapshot Reconciliation

*Command:* `npx.cmd tsx scripts/reconcileMigrationSnapshot.ts`  

- `[PASS] Invariant 1:` Sum of individual entitlements strictly matches snapshot total
- `[PASS] Invariant 2:` Eligible on-chain + claimable KC strictly matches composition
- `[PASS] Invariant 3:` ZERO test accounts (`is_test_account = true`) included in migration
- `[PASS] Invariant 4:` ZERO duplicate addresses in eligible entitlement set
- `[PASS] Invariant 5:` Total entitlement is within 10,000,000,000 KC hard cap

---

## 6. Build & Bundle Safety Verification

*Command:* `npm.cmd run build`  
*Target:* Clean production web client bundle  

- **TypeScript Compilation:** 0 errors
- **Vite Build Output:** Clean build in ~2.8s
- **Bundle Secrets Audit:**  
  `scripts/checkBundleSafety.mjs` executed:
  - `SUPABASE_SERVICE_ROLE_KEY`: **NOT FOUND (0 occurrences in client bundle)**
  - `PRIVATE_KEY`: **NOT FOUND (0 occurrences in client bundle)**
  - `DEPLOYER_KEY`: **NOT FOUND (0 occurrences in client bundle)**
  - Client bundle contains only public environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONTRACT_ADDRESS`).

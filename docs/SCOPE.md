# KURD COIN â€” AUDIT SCOPE SPECIFICATION

**Candidate Version:** `kurd-coin-audit-candidate-1`  
**Date:** September 29, 2026  

---

## 1. COMPONENT CLASSIFICATION TAXONOMY

Every file in this audit repository has been explicitly categorized under one of five operational statuses:

1. **`PRODUCTION CANDIDATE`**: Code intended for deployment on Base Mainnet or active in production backend infrastructure.
2. **`REHEARSAL ONLY`**: Code designed to simulate and verify mainnet governance, multisig handovers, or distributor behavior locally prior to deployment.
3. **`TEST-ONLY`**: Automated testing frameworks, stress harnesses, and mocks used strictly for verification.
4. **`DEPRECATED`**: Legacy testnet implementations retained for historical reference only.
5. **`UNKNOWN / REQUIRES DECISION`**: Architectural points requiring final governance or community determination before deployment.

---

## 2. IN-SCOPE COMPONENTS

### A. Smart Contracts (`contracts/src/`)

| Contract | Classification | Compiler | Description | In-Scope Focus |
|---|---|---|---|---|
| [`KurdCoin.sol`](./contracts/KurdCoin.sol) | **PRODUCTION CANDIDATE** | `0.8.27` | ERC-20 token with capped lifetime supply (10B KC), role-based minting, pausability, burnability, and EIP-712 claims. | Lifetime cap monotonicity, anti-recycling burn invariant, EIP-712 replay resistance, access controls. |
| [`KurdCoinMigrationDistributor.sol`](./contracts/KurdCoinMigrationDistributor.sol) | **PRODUCTION CANDIDATE** | `0.8.27` | Merkle claim distributor for 1:1 destination token claiming from verified beta snapshot. | Merkle tree leaf verification, exactly-once claim bit/mapping, double-claim prevention, emergency pausing. |
| [`KurdCoinGovernance.sol`](./contracts/KurdCoinGovernance.sol) | **PRODUCTION CANDIDATE** | `0.8.27` | OpenZeppelin `TimelockController` implementation enforcing a minimum delay (24h/48h) for admin actions. | Delay enforcement, proposer/executor separation, cancellation mechanics, self-administration. |
| [`MockSafeMultisig.sol`](./scripts/MockSafeMultisig.sol) | **REHEARSAL ONLY** | `0.8.27` | Lightweight M-of-N threshold multi-signature contract emulating Gnosis Safe behavior in local tests. | Test harness only; production will utilize audited Gnosis Safe contracts on Base. |

### B. Deployment & Handover Protocol

| Artifact | Classification | Description | In-Scope Focus |
|---|---|---|---|
| [`DEPLOYMENT_AND_HANDOVER.md`](./DEPLOYMENT_AND_HANDOVER.md) | **PRODUCTION CANDIDATE** | Step-by-step procedure for deploying contracts, configuring Timelock, and renouncing deployer EOA roles. | Zero-downtime transition, verification of role renouncement, prevention of orphaned contracts. |
| [`PRIVILEGED_ROLES.md`](./PRIVILEGED_ROLES.md) | **PRODUCTION CANDIDATE** | Comprehensive specification of all on-chain and off-chain privileged access roles. | Role separation, principle of least privilege, single point of failure elimination. |

### C. Migration & Cryptographic Proof Engine

| Script / File | Classification | Description | In-Scope Focus |
|---|---|---|---|
| [`src/lib/merkleTree.ts`](src/lib/merkleTree.ts) | **PRODUCTION CANDIDATE** | Standard Merkle tree construction, leaf hashing, and proof generation using `@openzeppelin/merkle-tree`. | Second-preimage collision resistance, deterministic root generation, leaf format. |
| [`scripts/generateMigrationSnapshot.ts`](scripts/generateMigrationSnapshot.ts) | **PRODUCTION CANDIDATE** | Snapshot generator querying on-chain Base Sepolia balances and off-chain claimable rewards at freeze block. | Invariant conservation, exclusion filtering, double-counting prevention. |
| [`scripts/reconcileMigrationSnapshot.ts`](./scripts/reconcileMigrationSnapshot.ts) | **PRODUCTION CANDIDATE** | Automated reconciliation engine verifying that snapshot sums strictly match database and Merkle totals. | 5 conservation invariants, mathematical zero-deviation proof. |

### D. Relayer & Backend Infrastructure

| Component | Classification | Description | In-Scope Focus |
|---|---|---|---|
| [`supabase/functions/claim-mining-rewards/index.ts`](supabase/functions/claim-mining-rewards/index.ts) | **PRODUCTION CANDIDATE** | Edge Function verifying user JWT, acquiring lease locks, and settling mining rewards on-chain. | Concurrency locks, idempotency key verification, destination address binding. |
| [`supabase/functions/sponsor-gas/index.ts`](supabase/functions/sponsor-gas/index.ts) | **PRODUCTION CANDIDATE** | Edge Function sponsoring gas for user transactions with strict circuit breakers and cooldown barriers. | Mainnet fail-closed logic, action allowlists, per-user limits, global daily spend cap. |
| [`src/config/sponsorPolicy.ts`](src/config/sponsorPolicy.ts) | **PRODUCTION CANDIDATE** | Centralized configuration defining fail-closed boundaries, allowed actions, and treasury limits. | Separation between Base Sepolia and Base Mainnet policies. |

### E. Database Security & Stored Procedures (PostgreSQL)

| Migration / Schema | Classification | Description | In-Scope Focus |
|---|---|---|---|
| `supabase/migrations/006_rls_lockdown.sql` | **PRODUCTION CANDIDATE** | Row Level Security (RLS) policies revoking direct client writes on all ledger and user tables. | Privilege escalation prevention, view security, role isolation. |
| `supabase/migrations/010_gas_sponsorship_system.sql` | **PRODUCTION CANDIDATE** | Concurrency locks (`pg_advisory_xact_lock`), reservation state machine, and cooldown checks. | Race condition prevention, double-reserve prevention. |
| `supabase/migrations/012_mining_claims_pipeline.sql` | **PRODUCTION CANDIDATE** | Distributed lease locking, idempotency table, and `reserve_mining_claim_rpc`. | Atomic state transitions, session reward locking. |
| `supabase/migrations/20260929180000_beta_mainnet_migration_foundation.sql` | **PRODUCTION CANDIDATE** | Snapshot tables, entitlement registry, exclusion tables, and immutability triggers. | Immutability trigger (`trg_enforce_snapshot_immutability`), search_path pinning. |

### F. Client-Side Vault & Cryptography (Custody Model)

| Component | Classification | Description | In-Scope Focus |
|---|---|---|---|
| [`src/utils/vaultCrypto.ts`](src/utils/vaultCrypto.ts) | **PRODUCTION CANDIDATE** | AES-256-GCM authenticated encryption and PBKDF2 (100,000 rounds) key derivation for user private keys. | Authenticated tag validation, unique salt/IV generation, zero-knowledge memory handling. |
| [`src/services/migrationService.ts`](src/services/migrationService.ts) | **PRODUCTION CANDIDATE** | EIP-191 signature generation for external destination wallet ownership verification. | Signature replay protection, domain binding. |

---

## 3. OUT-OF-SCOPE COMPONENTS

The following components are explicitly **excluded** from this security review as they do not affect core protocol security, fund custody, or on-chain settlement:

1. **Frontend Presentation & Styling:** React components in `src/components/`, `src/pages/`, CSS styles, icons, and layout wrappers.
2. **Marketing & Landing Pages:** Static public website pages (`/about`, `/tokenomics`, `/roadmap`, `/faq`).
3. **Analytics & Search Indexing:** Google Search Console tags, robots.txt, sitemap.xml.
4. **Third-Party External Infrastructure:** Supabase cloud hosting infrastructure, Base L2 sequencer internals, GitHub Actions runners, Vercel edge CDN.
5. **Decentralized Liquidity Pools:** Future Uniswap v3/Aerodrome pool creation, liquidity pair locks, and DEX trading interfaces (deferred to post-launch liquidity phase).


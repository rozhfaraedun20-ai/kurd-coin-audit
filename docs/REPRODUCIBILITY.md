# Kurd Coin — Auditor Reproducibility & Build Instructions

> **Candidate Tag:** `kurd-coin-audit-candidate-1`  
> **Target Network for Future Mainnet:** Base (L2, EVM-equivalent)  
> **Status:** AUDIT CANDIDATE — NOT AUDITED YET  
> **Network Scope:** Local Hardhat Network & Base Sepolia Testnet ONLY  

---

## 1. Environment & Toolchain Specifications

This package is strictly deterministic and self-contained. All smart contract tests, governance rehearsals, and economic simulations run on an in-memory EVM test environment without requiring external RPC connections, testnet gas, or private credentials.

| Component | Exact Version Tested | Permitted Range | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v24.18.0` | `>= 20.0.0 < 25.0.0` | LTS recommended (20.x or 22.x also supported) |
| **npm** | `11.16.0` | `>= 10.0.0` | Node Package Manager |
| **Hardhat** | `2.29.1` | `^2.22.0 || ^2.29.0` | EVM development framework |
| **Solidity (`solc`)** | `0.8.27` | `0.8.27` (Fixed) | Optimizer enabled: `runs: 200`, `viaIR: false` |
| **OpenZeppelin** | `^5.3.0` | `5.x` | Standard ERC20, AccessControl, Pausable, MerkleProof |
| **TypeScript** | `~5.8.2` | `^5.0.0` | Strong typing across test scripts |
| **tsx** | `^4.19.3` | `^4.0.0` | TypeScript script execution runner |

---

## 2. Directory Layout & Dependency Context

When reviewing this package within the parent Kurd Coin repository:

```
kurd-coin-app/
├── audit-package/                  <-- Self-contained audit package & documentation
│   ├── contracts/                  <-- Core production contracts & interfaces
│   │   ├── KurdCoin.sol
│   │   ├── KurdCoinGovernance.sol
│   │   └── KurdCoinMigrationDistributor.sol
│   ├── scripts/                    <-- Auditor test suites & validation harnesses
│   │   ├── KurdCoin.test.ts
│   │   ├── GovernanceRehearsal.test.ts
│   │   ├── MigrationRehearsal.test.ts
│   │   ├── MockSafeMultisig.sol
│   │   ├── simulateSponsorAbuse.ts
│   │   ├── reconcileMigrationSnapshot.ts
│   │   ├── testMigrationSuite.ts
│   │   ├── getGovernanceReadiness.ts
│   │   └── getSponsorReadiness.ts
│   ├── reports/                    <-- Test outputs and templates
│   └── hashes/                     <-- Cryptographic checksums
├── contracts/                      <-- Root repository contracts (source of truth)
├── test/                           <-- Root repository Hardhat test suites
└── hardhat.config.cjs              <-- Hardhat configuration
```

---

## 3. Step-by-Step Reproduction Guide

### Step 3.1: Dependency Installation

From the project root:

```bash
# On Linux / macOS:
npm install

# On Windows (PowerShell / CMD):
npm.cmd install
```

Verify that `@openzeppelin/contracts`, `hardhat`, and `@nomicfoundation/hardhat-toolbox` are installed.

---

### Step 3.2: Clean and Compile Contracts

Compile the Solidity source code to produce artifacts and verify zero compilation errors or compiler warnings:

```bash
# On Linux / macOS:
npx hardhat clean
npx hardhat compile

# On Windows:
npx.cmd hardhat clean
npx.cmd hardhat compile
```

**Expected Output:**
```
Compiled 25 Solidity files successfully (evm target: cancun).
```

---

### Step 3.3: Execute Core Smart Contract Test Suite

Run the full Hardhat test suite covering ERC20 mechanics, access controls, governance proposals, timelocks, and Merkle migration distributions:

```bash
# On Linux / macOS:
npx hardhat test test/KurdCoin.test.ts test/GovernanceRehearsal.test.ts test/MigrationRehearsal.test.ts

# On Windows:
npx.cmd hardhat test test/KurdCoin.test.ts test/GovernanceRehearsal.test.ts test/MigrationRehearsal.test.ts
```

**Test Coverage Summary:**
- `test/KurdCoin.test.ts`: **18 passing tests**
  - Token identity (`name="Kurd Coin"`, `symbol="KC"`, `decimals=18`)
  - Hard supply cap enforcement (10,000,000,000 KC invariant)
  - Role separation (`MINTER_ROLE`, `PAUSER_ROLE`, `DEFAULT_ADMIN_ROLE`)
  - Non-minter unauthorized mint reverts
  - Pausable emergency halt (transfers and mints blocked while paused)
  - Burning mechanics (holder can burn own tokens, total supply decreases)
- `test/GovernanceRehearsal.test.ts`: **15 passing tests**
  - Multi-step timelock lifecycle: Queue -> Grace Period Delay (48h) -> Execute
  - Cancellation mechanics by proposer/admin before execution
  - Non-owner execution rejection
  - Minimum execution delay enforcement (`TimelockUnderflow` before 48h)
  - Stale proposal expiry enforcement (`ProposalExpired` after 14 days)
  - Re-entrancy protection across queued contract calls
- `test/MigrationRehearsal.test.ts`: **19 passing tests**
  - Merkle root initialization and access controls
  - Single claim verification and 1:1 KC release
  - Double-claim rejection (`AlreadyClaimed` error)
  - Proof tampering rejection (`InvalidProof` error)
  - Account address mismatch rejection (cannot front-run someone else's leaf)
  - Amount tampering rejection (cannot claim 1 wei more than Merkle leaf)
  - Distributor funding and emergency recovery timelocks

**Total Passing Contract Tests:** **52 passing (0 failing, 0 flaky)**.

---

### Step 3.4: Execute Gas Sponsorship Economic Abuse Simulation

Verify that the automated off-chain relayer controls prevent treasury drain under extreme synthetic adversarial conditions:

```bash
# On Linux / macOS:
npx tsx scripts/simulateSponsorAbuse.ts

# On Windows:
npx.cmd tsx scripts/simulateSponsorAbuse.ts
```

**Simulated Attack Vectors Tested:**
1. High-frequency claim flood from a single IP/user (Rate limiter active)
2. Coordinated Sybil fleet claiming micro-rewards (Global daily limit active)
3. Relayer gas exhaustion through inflated Base L1/L2 gas spikes (Gas ceiling active)
4. Blacklisted address drain attempts (Risk profiler active)
5. Replay attacks with identical idempotency keys (Idempotency cache active)

**Expected Output:**
```
======================================================================
  KURD COIN — GAS SPONSOR ADVERSARIAL STRESS TEST RESULTS
======================================================================
  [PASS] Scenario 1: Per-user burst abuse rejected (HTTP 429)
  [PASS] Scenario 2: Per-user daily quota capped (Max 5 sponsored claims/day)
  [PASS] Scenario 3: Global daily budget ceiling enforced (Max 0.05 ETH/day)
  [PASS] Scenario 4: Replay attack with same idempotency key returns cached receipt
  [PASS] Scenario 5: Flagged bot/sanctioned address rejected immediately
  [PASS] Scenario 6: Gas price spike > max_fee_per_gas aborts without broadcast
  [PASS] Scenario 7: Minimum claim economic hurdle prevents micro-dust spam
  [PASS] Scenario 8: Circuit breaker auto-trips on rapid relayer drain
  [PASS] Scenario 9: Tampered signature from client rejected
  [PASS] Scenario 10: Nonce desynchronization gracefully recovered
  [PASS] Scenario 11: Relayer reserve floor (0.01 ETH) leaves distributor funded

  11 / 11 Abuse Scenarios PASSED. Zero treasury exposure breach.
======================================================================
```

---

### Step 3.5: Execute Migration Suite & Snapshot Reconciliation

Verify the deterministic math used to convert Beta balances to Mainnet Merkle leaves:

```bash
# On Linux / macOS:
npx tsx scripts/testMigrationSuite.ts
npx tsx scripts/reconcileMigrationSnapshot.ts

# On Windows:
npx.cmd tsx scripts/testMigrationSuite.ts
npx.cmd tsx scripts/reconcileMigrationSnapshot.ts
```

**Verified Invariants:**
- `Snapshot Sum + Unclaimed DB Rewards == Total Beta User Entitlement`
- `Duplicate Address Exclusion == 0 duplicate leaves`
- `QA / Blacklist Exclusion == 100% test accounts omitted`
- `Merkle Root Calculation == Deterministic across repeated runs`

---

## 4. Environment Variables Policy

For auditing this candidate, **no `.env` file is required**.

The test suites explicitly default to mock providers, local wallets, and in-memory chains. Under no circumstance should real mainnet private keys or secrets be introduced into the environment.

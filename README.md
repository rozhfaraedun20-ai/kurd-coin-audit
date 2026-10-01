# Kurd Coin — Audit Candidate

**Status:**  
`AUDIT CANDIDATE — NOT YET INDEPENDENTLY AUDITED`

**Network:**  
Currently Base Sepolia testnet (Chain ID: `84532`)

**Future target:**  
Base Mainnet (EVM L2, Chain ID: `8453`)

**Token lifetime cap:**  
`10,000,000,000 KC` (10 Billion Kurd Coin)

---

## Contracts in Scope

| Contract Name | File Location | Compiler | Primary Purpose |
| :--- | :--- | :---: | :--- |
| **KurdCoin** | `contracts/KurdCoin.sol` | `0.8.27` (`^0.8.24`) | Core ERC-20 token, 10B lifetime cap, AccessControl (`DEFAULT_ADMIN`, `MINTER`, `PAUSER`), emergency pausability, EIP-712 typed claim authorization. |
| **KurdCoinGovernance** | `contracts/KurdCoinGovernance.sol` | `0.8.27` | OpenZeppelin `TimelockController` (48-hour delay) governing administrative and minter actions on mainnet. |
| **KurdCoinMigrationDistributor** | `contracts/KurdCoinMigrationDistributor.sol` | `0.8.27` | Merkle claim distributor for 1:1 Beta-to-Mainnet token migration, enforcing single-claim verification. |

---

## Audit Candidate Verification

- **Audit candidate:** `kurd-coin-audit-candidate-1`
- **Archive SHA-256:** `A10CC63657A2CF234E1D2FE4251C3CE7D389D91B7A653939F9AAB8F2521661D8`
- **SHA-256 Manifest:** See [`hashes/SHA256SUMS.txt`](hashes/SHA256SUMS.txt)

---

## Internal Testing & Security Scanning Summary

- **0** Critical
- **0** High
- **0** Medium
- **2** Low
- **3** Informational
- **78 / 78** contract tests passing (EVM in-memory unit, governance, and red-team tests)
- **22 / 22** migration tests (1:1 math and Merkle invariants)
- **18 / 18** wallet security tests (PBKDF2 600,000 iterations, AES-GCM tags, cloud recovery)
- **7 / 7** database security checks (PostgreSQL RLS, RPC privileges)
- **11 / 11** sponsor abuse tests (10,000 requests, 0.05 ETH daily circuit breaker)
- **5,000** randomized accounting operations passed (zero drift, non-double-counting verified)

> [!CAUTION]
> **Independent Review Required:**  
> These internal tests are **NOT** a substitute for independent human review. This repository is published strictly as an audit candidate for third-party security verification.

---

## Documentation Index

- **Scope & Boundaries:** [`docs/SCOPE.md`](docs/SCOPE.md)
- **Architecture & Dataflows:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Threat Model (STRIDE):** [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
- **Protocol Invariants:** [`docs/SECURITY_INVARIANTS.md`](docs/SECURITY_INVARIANTS.md)
- **Trust Assumptions:** [`docs/TRUST_ASSUMPTIONS.md`](docs/TRUST_ASSUMPTIONS.md)
- **Privileged Roles:** [`docs/PRIVILEGED_ROLES.md`](docs/PRIVILEGED_ROLES.md)
- **Migration Specification:** [`docs/MIGRATION_MODEL.md`](docs/MIGRATION_MODEL.md)
- **Reproducibility Guide:** [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md)
- **Auditor Questions:** [`docs/AUDITOR_QUESTIONS.md`](docs/AUDITOR_QUESTIONS.md)
- **Known Limitations:** [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)
- **Red Team Findings:** [`reports/phase_12_red_team_findings.md`](reports/phase_12_red_team_findings.md)
- **Full Test Results:** [`reports/REGRESSION_TEST_RESULTS.md`](reports/REGRESSION_TEST_RESULTS.md)

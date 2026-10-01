# KURD COIN — PRIVILEGED ROLE MATRIX

This specification details the authoritative access-control topology across both the current testnet beta and the intended production mainnet deployment.

---

## 1. CURRENT TESTNET ROLES (BASE SEPOLIA - 84532)

| Role | Current Holder | Holder Type | Privileged Capabilities | Hard Limitations | Compromise Impact | Revocation Protocol |
|---|---|---|---|---|---|---|
| **DEFAULT_ADMIN_ROLE** | Deployer EOA (`0x60D698...`) | Single Private Key (EOA) | Can grant and revoke all roles (`MINTER_ROLE`, `PAUSER_ROLE`, admin). | Cannot mint directly without granting itself `MINTER_ROLE`. | **CRITICAL:** Attacker can reassign all contract roles. | Renounceable via `renounceRole(DEFAULT_ADMIN_ROLE, account)`. |
| **MINTER_ROLE** | Deployer EOA (`0x60D698...`) | Single Private Key (EOA) | Direct minting of KC tokens up to 10B cap. | Bounded by monotonic `totalMinted <= cap()`. | **HIGH:** Attacker can mint remaining capacity up to cap. | Revocable by `DEFAULT_ADMIN_ROLE`. |
| **MINTER_ROLE** | Claim Distributor (`0x0F79F4...`) | Server Relayer Key (EOA) | Signs EIP-712 claims and direct mints for mining payouts. | Bounded by 10B cap and per-user session constraints. | **HIGH:** Key compromise allows minting tokens up to cap. | Revocable by `DEFAULT_ADMIN_ROLE`. |
| **PAUSER_ROLE** | Deployer EOA (`0x60D698...`) | Single Private Key (EOA) | Can freeze token transfers, mints, and claims in emergency. | Cannot transfer funds or mint tokens. | **MEDIUM:** Attacker can cause denial of service. | Revocable by `DEFAULT_ADMIN_ROLE`. |
| **Gas Sponsor** | Gas Sponsor Vault (`0xD072F5...`) | Server Relayer Key (EOA) | Sends native ETH for user gas fees. | **Holds ZERO roles on KC smart contract.** | **FINANCIAL ONLY:** Can drain relayer ETH (capped at 0.05 ETH/24h). | Empty wallet, rotate key in Supabase secrets. |
| **Backend Service Role** | Supabase Edge Secrets | Server Environment Secret | Executes `SECURITY DEFINER` DB stored procedures. | Direct SQL constrained by PostgreSQL functions and pinned search_path. | **HIGH:** Can manipulate off-chain database records. | Rotate secret in Supabase dashboard. |

---

## 2. PLANNED MAINNET ROLES (BASE MAINNET - 8453)

| Role | Planned Mainnet Holder | Holder Type | Privileged Capabilities | Hard Limitations | Compromise Impact | Revocation Protocol |
|---|---|---|---|---|---|---|
| **DEFAULT_ADMIN_ROLE** | `KurdCoinTimelock` | OpenZeppelin TimelockController | Grants/revokes roles, updates contract parameters. | Actions subject to **24h - 48h execution delay**. | **VERY LOW:** Single compromised key cannot act alone or bypass delay. | Timelock self-administration via multisig proposal. |
| **Timelock Proposer** | Community Safe Multisig | Gnosis Safe (3-of-5 threshold) | Proposes administrative changes and role updates. | Cannot execute without threshold signatures and timelock delay. | **VERY LOW:** Requires 3 independent hardware key compromises. | Safe owner rotation via multisig transaction. |
| **Timelock Executor** | Community Safe Multisig (or Open) | Gnosis Safe / Monitored Keeper | Triggers execution of proposals once delay has elapsed. | Can only execute operations that have successfully passed delay. | **NEGLIGIBLE:** Can only execute pre-approved, matured proposals. | Safe owner rotation or address removal. |
| **Emergency Guardian (PAUSER_ROLE)** | Dedicated Security Multisig (2-of-3) | Monitored Fast Multisig | Can INSTANTLY freeze transfers, mints, and claims. | **ZERO minting authority; ZERO admin authority.** Cannot unpause unilaterally if unpause is governed by Timelock. | **LOW-MEDIUM:** Can cause temporary transfer freeze until Timelock revokes role and unpauses. | Revocable by `TimelockController`. |
| **Migration Distributor** | `KurdCoinMigrationDistributor` | Immutable Smart Contract | Distributes 1:1 KC to verified beta migrants with Merkle proofs. | **Holds ZERO minting role.** Pre-funded with exact snapshot allocation. | **NEGLIGIBLE:** Can only release tokens to accounts with valid Merkle proofs. | Once funds distributed, contract becomes inactive. |
| **Claim Distributor (Steady State)** | Mainnet Mining Reserve | Escrow Contract / Timelocked Minter | Releases mining rewards according to 5-tier halving schedule. | Bounded by remaining mining reserve allocation. | **MEDIUM:** Cannot exceed fixed reserve budget. | Revocable by `TimelockController`. |
| **Gas Sponsor (Mainnet)** | Gas Sponsor Vault | Server Relayer Key | Sponsors one-time migration claim transaction gas. | **Disabled for normal transfers.** Capped at 0.05 ETH daily drain ceiling. | **FINANCIAL ONLY:** Maximum protocol exposure bounded to 0.05 ETH/24h. | Rotate secret or revoke funding. |

---

## 3. SEPARATION OF POWERS ARCHITECTURE

```
                               ┌────────────────────────────────┐
                               │   Gnosis Safe Multisig (3-of-5)│
                               └───────────────┬────────────────┘
                                               │ Proposes & Executes (M-of-N)
                                               ▼
                               ┌────────────────────────────────┐
                               │  KurdCoinTimelock (24h Delay)  │
                               └───────────────┬────────────────┘
                                               │ DEFAULT_ADMIN_ROLE
                                               ▼
┌──────────────────────────────┐        ┌───────────────────────┐
│ Emergency Guardian (PAUSER)  ├───────►│    KurdCoin.sol       │◄────── Pre-Funded (No Mint Role)
│ (Instant Freeze, Zero Admin) │        │ (10B Cap, Capped Mint)│        ┌──────────────────────────────┐
└──────────────────────────────┘        └───────────────────────┘        │ KurdCoinMigrationDistributor │
                                                                         └──────────────────────────────┘
```

1. **Decoupled Administration:** No single human key can unilaterally mint tokens, change roles, or pause the token contract.
2. **Speed vs Safety Separation:** Freezing transfers during an exploit is fast (immediate guardian invocation). Unpausing or reassigning permissions is slow and deliberate (24h - 48h timelock notice).

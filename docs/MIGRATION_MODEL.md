# KURD COIN â€” BETA-TO-MAINNET MIGRATION ACCOUNTING MODEL

---

## 1. CORE ENTITLEMENT FORMULA

The Kurd Coin migration model guarantees a strict **1:1 carried value** from Base Sepolia beta into future Base Mainnet.

$$\text{Eligible Migration Entitlement} = \text{Current On-Chain Beta KC} + \text{Unclaimed Claimable KC}$$

### STRICT ACCOUNTING RULE: NO DOUBLE COUNTING
The protocol **NEVER** adds lifetime mined KC or `claimed_kc` to on-chain balances:
$$\text{Entitlement} \neq \text{Lifetime Mined KC} + \text{On-Chain KC} \quad \text{(FORBIDDEN)}$$
Because claimed tokens are already present in the user's on-chain balance, adding `claimed_kc` would inflate the user's entitlement by $2\times$ and corrupt tokenomics.

---

## 2. WORKED EXAMPLES

### Example 1: Full Claimer
- **Activity:** Alice mines 10 KC during beta. She completes her claims and holds 10 KC in her on-chain EVM wallet.
- **On-chain balance:** 10.0 KC
- **Unclaimed claimable:** 0.0 KC
- **Calculation:** $10.0 + 0.0 = 10.0\text{ KC}$
- **Mainnet Entitlement:** **10.0 KC**

### Example 2: Partial Claimer
- **Activity:** Bob mines 10 KC during beta. He claims 6 KC on-chain, and leaves 4 KC in his off-chain mining ledger.
- **On-chain balance:** 6.0 KC
- **Unclaimed claimable:** 4.0 KC
- **Calculation:** $6.0 + 4.0 = 10.0\text{ KC}$
- **Mainnet Entitlement:** **10.0 KC**

### Example 3: Transferred Wealth
- **Activity:** Charlie mines 10 KC, claims all 10 KC on-chain, and sends 3 KC to Dana on Base Sepolia.
- **Charlie on-chain balance:** 7.0 KC
- **Dana on-chain balance:** 3.0 KC
- **Calculation:** Charlie entitlement = 7.0 KC, Dana entitlement = 3.0 KC.
- **Total Entitlement:** $7.0 + 3.0 = 10.0\text{ KC}$ (Conserved exactly).

---

## 3. EXCLUSION REGISTRY & SYSTEM WALLETS

To prevent artificial inflation or developer enrichment, specific system and testing balances are mathematically excluded from the migration pool via `public.migration_exclusions`:

| Address | Category | Reason for Exclusion |
|---|---|---|
| `0x0000000000000000000000000000000000000000` | `burn_address` | Zero burn address |
| `0x000000000000000000000000000000000000dead` | `burn_address` | Standard dead address |
| `0x60d698f5a2e36f8763e91cb2ab0c2abc0641508d` | `deployer_initial_supply` | Testnet bootstrap supply (100 KC) |
| `0x0f79f49697002a12e1bdfec6a62df497bbe74ee0` | `claim_distributor` | Testnet claim relayer key |
| `0xd072f594391f183502f2ed6650d5f3a24bcce7a8` | `gas_sponsor` | Gas sponsorship vault |
| `0x62832f73d2fc5e1223a6a31b52ca2985a0130ca0` | `system_contract` | Testnet KC token contract itself |
| 79 Dedicated QA Accounts (`is_test_account = true`) | `qa_account` | Automated testing & stress simulations |

---

## 4. MERKLE TREE SPECIFICATION

1. **Leaf Encoding:** Canonical OpenZeppelin double-hash standard to eliminate second-preimage attack vulnerabilities:
   $$\text{leaf} = \text{keccak256}\Big(\text{bytes.concat}\big(\text{keccak256}(\text{abi.encode}(\text{uint256 index}, \text{address account}, \text{uint256 amount}))\big)\Big)$$
2. **Deterministic Ordering:** Leaves are sorted by `keccak256(leaf)` before pairing, guaranteeing a deterministic Merkle root regardless of database row order.
3. **Proof Verification:** Executed on-chain in `KurdCoinMigrationDistributor.sol` via OpenZeppelin `MerkleProof.verify(merkleProof, merkleRoot, leaf)`.
4. **Exactly-Once Settlement:** Once index `i` is claimed, the distributor sets `_claimed[index] = true`. Replay attempts revert.

---

## 5. RECONCILIATION INVARIANTS (MATHEMATICAL CONSERVATION)

The automated script [`scripts/reconcileMigrationSnapshot.ts`](scripts/reconcileMigrationSnapshot.ts) audits 5 strict mathematical conservation invariants:

1. $\sum \text{Eligible Entitlements} \equiv \text{Recorded Snapshot Total}$
2. $\sum \text{On-Chain Eligible} + \sum \text{Claimable Mined} \equiv \text{Total Entitlement}$
3. $\text{Count of Test Accounts in Eligible Pool} \equiv 0$
4. $\text{Count of Duplicate Addresses in Eligible Pool} \equiv 0$
5. $\text{Total Migration Entitlement} \le 10,000,000,000\text{ KC}$


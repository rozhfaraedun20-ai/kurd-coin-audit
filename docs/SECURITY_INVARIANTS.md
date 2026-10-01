# KURD COIN — PROTOCOL SECURITY INVARIANTS

> **AUDITOR NOTE:** Every invariant listed below is covered by automated property tests or unit tests in the Kurd Coin codebase. Each entry details the enforcing code location, verifying test, and exact expected behavior.

---

### Invariant 1: Lifetime Minted KC Never Exceeds 10 Billion KC
- **Code:** `contracts/src/KurdCoin.sol` lines 97, 125
  ```solidity
  require(totalMinted + amount <= cap(), "KurdCoin: total minted exceeds cap");
  ```
- **Test:** `contracts/test/KurdCoin.test.ts` (test: "reverts if mint exceeds the 10B lifetime cap") & `contracts/test/GovernanceRehearsal.test.ts` (test: 5.2)
- **Expected Behavior:** Any attempt to mint tokens such that `totalMinted + amount > 10,000,000,000 * 10^18` strictly reverts with `"KurdCoin: total minted exceeds cap"`.

---

### Invariant 2: Burning KC Never Reopens Minting Capacity
- **Code:** `contracts/src/KurdCoin.sol` lines 52, 99, 138
  ```solidity
  totalMinted += amount;
  ```
- **Test:** `contracts/test/GovernanceRehearsal.test.ts` (test: 5.3) & `contracts/test/KurdCoin.test.ts`
- **Expected Behavior:** `totalMinted` is strictly monotonic. Calling `burn()` reduces circulating `totalSupply()`, but does not decrement `totalMinted`. The protocol cannot recycle burned supply to mint additional tokens past the 10B lifetime cap.

---

### Invariant 3: Migration Entitlement Can Be Claimed Exactly Once
- **Code:** `contracts/src/KurdCoinMigrationDistributor.sol` lines 49, 56
  ```solidity
  require(!_claimed[index], "Migration already claimed");
  _claimed[index] = true;
  ```
- **Test:** `contracts/test/MigrationRehearsal.test.ts` (test: 3)
- **Expected Behavior:** Once index `i` has been successfully claimed, subsequent claim transactions referencing index `i` strictly revert with `"Migration already claimed"`.

---

### Invariant 4: Merkle Proof Strictly Binds Leaf Index, Address, and Amount
- **Code:** `contracts/src/KurdCoinMigrationDistributor.sol` lines 53-54
  ```solidity
  bytes32 leaf = keccak256(abi.encodePacked(index, account, amount));
  require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid Merkle proof");
  ```
- **Test:** `contracts/test/MigrationRehearsal.test.ts` (test: 4) & `scripts/testMigrationSuite.ts` (test: 17)
- **Expected Behavior:** Submitting an altered account address, altered amount, or proof from a different index strictly reverts with `"Invalid Merkle proof"`.

---

### Invariant 5: QA and Test Accounts Are Excluded from Migration Entitlement
- **Code:** `supabase/migrations/20260929180000_beta_mainnet_migration_foundation.sql` lines 232-245
  ```sql
  IF v_is_test THEN
    RETURN jsonb_build_object('success', true, 'eligible', false, 'estimated_entitlement_kc', 0);
  END IF;
  ```
- **Test:** `scripts/testMigrationSuite.ts` (test: 6) & `scripts/reconcileMigrationSnapshot.ts` (Invariant 3)
- **Expected Behavior:** Accounts flagged `is_test_account = true` or listed in `migration_exclusions` receive 0 KC entitlement in snapshot generation.

---

### Invariant 6: Historical Claimed KC Is Never Double-Counted
- **Code:** `scripts/generateMigrationSnapshot.ts` lines 120-135
  $$\text{Entitlement} = \text{Current On-Chain KC} + \text{Unclaimed Claimable KC}$$
- **Test:** `scripts/testMigrationSuite.ts` (tests: 2, 3)
- **Expected Behavior:** Tokens already claimed on-chain are counted through the user's on-chain balance. `claimed_kc` is explicitly excluded from the off-chain ledger query, preventing $2\times$ inflation.

---

### Invariant 7: Current Ownership Is Preserved During Snapshot Migration
- **Code:** `scripts/generateMigrationSnapshot.ts` lines 140-155
- **Test:** `scripts/testMigrationSuite.ts` (test: 4)
- **Expected Behavior:** If User A mines 10 KC, claims them, and transfers 3 KC to User B on-chain: User A holds 7 KC, User B holds 3 KC. Entitlements generated are strictly $A=7$ and $B=3$ (sum = 10 KC).

---

### Invariant 8: Unauthorized Addresses Cannot Mint Tokens
- **Code:** `contracts/src/KurdCoin.sol` lines 94, 134
  ```solidity
  function mint(...) external onlyRole(MINTER_ROLE) whenNotPaused
  ```
- **Test:** `contracts/test/GovernanceRehearsal.test.ts` (test: 5.4) & `contracts/test/KurdCoin.test.ts`
- **Expected Behavior:** Calls to `mint()` from accounts lacking `MINTER_ROLE` revert with custom error `AccessControlUnauthorizedAccount`.

---

### Invariant 9: Unauthorized Addresses Cannot Grant or Revoke Roles
- **Code:** OpenZeppelin `AccessControl.sol` v5.0 (Role admin is `DEFAULT_ADMIN_ROLE`)
- **Test:** `contracts/test/GovernanceRehearsal.test.ts` (tests: 2.1, 4.1)
- **Expected Behavior:** Non-admin accounts attempting `grantRole()` or `revokeRole()` revert with `AccessControlUnauthorizedAccount`.

---

### Invariant 10: Emergency Guardian Has Zero Minting and Zero Admin Powers
- **Code:** `contracts/src/KurdCoin.sol` lines 149-158
- **Test:** `contracts/test/GovernanceRehearsal.test.ts` (test: 3.3)
- **Expected Behavior:** Guardian account holding `PAUSER_ROLE` can invoke `pause()`, but attempts to invoke `mint()`, `grantRole()`, or transfer funds strictly revert.

---

### Invariant 11: Sponsor Relayer Cannot Fund Arbitrary Target Contracts
- **Code:** `supabase/functions/sponsor-gas/index.ts` lines 118-127 & `src/config/sponsorPolicy.ts`
- **Test:** `scripts/simulateSponsorAbuse.ts` (test: 7)
- **Expected Behavior:** Only recognized transactions targeting approved Kurd Coin contracts with validated parameters are accepted. Unknown contracts or arbitrary calldata are rejected.

---

### Invariant 12: Sponsor Spending Cannot Exceed Global Daily Ceiling (0.05 ETH)
- **Code:** `supabase/migrations/010_gas_sponsorship_system.sql` lines 377-395
- **Test:** `scripts/simulateSponsorAbuse.ts` (tests: 8, 9)
- **Expected Behavior:** Once cumulative rolling 24-hour sponsorship requests reach 0.05 ETH, subsequent reservations revert with `GLOBAL_DAILY_CAP_REACHED`.

---

### Invariant 13: Finalized Migration Snapshots Are Cryptographically Immutable
- **Code:** `supabase/migrations/20260929180000_beta_mainnet_migration_foundation.sql` lines 301-325
  ```sql
  CREATE OR REPLACE FUNCTION public.trg_enforce_snapshot_immutability() ...
  IF OLD.status = 'finalized' THEN RAISE EXCEPTION 'Immutable snapshot';
  ```
- **Test:** `scripts/testMigrationSuite.ts` (test: 22)
- **Expected Behavior:** Any `UPDATE` or `DELETE` executed against a snapshot with `status = 'finalized'` or its child entitlement rows aborts with an uncatchable exception.

---

### Invariant 14: Regular Users Cannot Mutate Database Entitlements
- **Code:** `supabase/migrations/20260929180000_beta_mainnet_migration_foundation.sql` lines 144-156
- **Test:** `scripts/testMigrationSuite.ts` (test: 20) & RLS Lockdown tests
- **Expected Behavior:** Direct SQL `INSERT`, `UPDATE`, or `DELETE` on `migration_entitlements` from `anon` or `authenticated` roles is denied by Row Level Security.

---

### Invariant 15: Destination Address Redirection Requires Cryptographic Proof
- **Code:** `supabase/migrations/20260929180000_beta_mainnet_migration_foundation.sql` lines 255-275
- **Test:** `scripts/testMigrationSuite.ts` (tests: 11, 12)
- **Expected Behavior:** Redirecting a migration destination to a new EVM address requires an EIP-191 signature signed by the source private key. Mismatched or forged signatures revert.

# KURD COIN — SPECIFIC AUDITOR INQUIRIES & FOCUS AREAS

> **TO THE INDEPENDENT AUDITOR:**  
> The Kurd Coin team requests that your formal review pay particular attention to the following 16 specific security, invariant, and architectural questions:

---

1. **Lifetime Cap Monotonicity:**  
   In `KurdCoin.sol`, is it mathematically or practically possible under any sequence of calls (including edge overflow, reentrancy, or role manipulation) to mint more than `10,000,000,000 * 10^18` wei?

2. **Burn Anti-Recycling Invariant:**  
   Does calling `burn()` or `burnFrom()` allow minters to recycle burned token headroom to mint new tokens beyond the original 10 Billion KC cap?

3. **Deployer Privilege Extinction:**  
   Following the 7-step handover sequence in `DEPLOYMENT_AND_HANDOVER.md`, can the deployer EOA regain `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, or `PAUSER_ROLE` through any unrevoked permission or default fallback?

4. **Merkle Claim Replay Resistance:**  
   In `KurdCoinMigrationDistributor.sol`, does the `_claimed[index]` state mapping guarantee that an entitlement cannot be claimed multiple times across blocks, reorgs, or transactions?

5. **Second-Preimage Attack Surface:**  
   Does our Merkle leaf hashing format provide complete collision and second-preimage attack resistance across all valid leaf lengths and encodings?

6. **Entitlement Non-Double-Counting:**  
   Does the snapshot query in `generateMigrationSnapshot.ts` guarantee that claimed tokens and unclaimed mining rewards can never inflate user entitlement beyond their authentic earned value?

7. **EIP-191 Destination Redirection Security:**  
   In `migration_external_verifications`, are EIP-191 destination verification messages vulnerable to signature replay across different accounts or chains?

8. **Compromised Relayer Blast Radius:**  
   If the private key of the automated claim distributor (`0x0F79F4...`) were compromised, what is the maximum damage an attacker could execute before the contract is paused by the Emergency Guardian?

9. **Timelock Delay Enforcement:**  
   Can a compromised multisig proposer bypass the 24-hour execution delay in `KurdCoinTimelock.sol` through any standard or non-standard scheduling mechanism?

10. **Emergency Guardian Least Privilege:**  
    Is the `PAUSER_ROLE` held by the Emergency Guardian strictly confined to freezing the contract, or does any code path permit the guardian to mint, reassign roles, or transfer user assets?

11. **Gas Relayer Economic Drain Defense:**  
    Under an adversarial scenario where a malicious botnet fires 50,000 concurrent requests, does the PostgreSQL advisory lock and rolling 24-hour circuit breaker in `reserve_gas_sponsorship_rpc` strictly bound treasury expenditure to $\le 0.05\text{ ETH}$?

12. **PostgreSQL SECURITY DEFINER Hygiene:**  
    Are any of the `SECURITY DEFINER` stored procedures in the database schema vulnerable to search-path hijacking, SQL injection, or execution by unauthenticated callers?

13. **API & Client Key Exposure:**  
    Are there any scenarios where `service_role` privileges, private keys, or decrypted vaults can be leaked to frontend clients or browser storage?

14. **Vault PBKDF2 & AES-GCM Implementation:**  
    In `src/utils/vaultCrypto.ts`, does the Web Cryptography implementation adhere to standard cryptographic guidelines regarding salt uniqueness (16 bytes), IV generation (12 bytes), and authenticated encryption tag validation?

15. **EVM Compatibility & Standard Conformity:**  
    Does `KurdCoin.sol` conform 100% to ERC-20 standard expectations for integration with Uniswap v3/v4, Aerodrome, Base sequencer, Bridges, and cold storage hardware wallets?

16. **Handover Sequence Robustness:**  
    Are there any subtle ordering flaws in the 12-step mainnet deployment sequence that could leave the contract orphaned or temporarily un-administered?

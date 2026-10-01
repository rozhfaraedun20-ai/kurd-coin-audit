# KURD COIN — KNOWN LIMITATIONS & PENDING PRE-MAINNET ITEMS

> **AUDITOR NOTICE:** The Kurd Coin team maintains complete transparency regarding the current unfinished operational items and known limitations.

---

1. **Current Environment Is Testnet Only:**
   The live network is Base Sepolia (Chain ID: 84532). No smart contracts, liquidity pools, or tokens have been deployed on Base Mainnet.

2. **No Prior Independent Audit:**
   This codebase has been verified extensively through internal unit tests, invariant test suites, and rehearsals, but **has NOT yet completed an external third-party security audit**.

3. **Beta Mining Remains Active (Snapshot Not Finalized):**
   Beta mining continues on Base Sepolia. The final migration snapshot has intentionally **not** been finalized. Final snapshot freeze, Merkle root generation, and database immutability locking will occur only after an announced community cut-off block height.

4. **Production Gnosis Safe Pending Deployment:**
   The 3-of-5 Gnosis Safe multisig has been simulated and rehearsed via `MockSafeMultisig.sol` and `KurdCoinTimelock.sol`, but the real multi-signature safe has not yet been deployed on Base Mainnet.

5. **Production Keys Not Yet Provisioned:**
   Hardware security keys (e.g. Ledger / Trezor devices) for the production multisig signers and production relayer keys have not yet been provisioned or funded with real mainnet ETH.

6. **Gas Sponsorship Mainnet Policy Requires Production Funding:**
   While the `sponsor-gas` Edge Function and `src/config/sponsorPolicy.ts` implement fail-closed behavior, circuit breakers, and allowlists, real-money mainnet sponsorship remains disabled (`SPONSOR_ENABLED=false`) until explicitly enabled for migration claims.

7. **Decentralized Liquidity & Markets Out of Scope:**
   This audit scope is strictly limited to token mechanics, Merkle claims, access controls, database security, and vault cryptography. Future DEX liquidity pools (Aerodrome/Uniswap), pricing mechanics, and centralized exchange listings are separate commercial activities.

8. **Legal & Regulatory Compliance:**
   The project has prepared terms of service, testnet disclaimers, and risk disclosures, but code audits do not evaluate local securities or tax regulations across varying sovereign jurisdictions.

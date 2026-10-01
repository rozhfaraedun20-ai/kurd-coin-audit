# KURD COIN — SYSTEM ARCHITECTURE & DATAFLOW

```mermaid
flowchart TD
    %% Users & Client Layer
    subgraph ClientLayer["Client & Wallet Layer"]
        U["End User (Mobile/Web)"]
        W["Kurd Coin Web App (React/Vite PWA)"]
        V["Client-Side Encrypted Vault\n(AES-256-GCM / PBKDF2 100k)"]
        EVM["Built-In EVM Wallet\n(Private Key in Memory Only)"]
        EXT["External Web3 Wallet\n(MetaMask / Coinbase Wallet)"]
    end

    %% Backend & Relayer Layer
    subgraph BackendLayer["Backend & Relayer Layer (Supabase / Deno Edge)"]
        AUTH["Supabase Auth (JWT)"]
        DB[("PostgreSQL Database\n(RLS Lockdown / Pinned search_path)")]
        MINE_ENG["Server Mining Ledger\n(0.25 KC/24h, Halving, Additive Bonuses)"]
        CLAIM_FN["Edge Function: claim-mining-rewards\n(JWT Check, Lease Lock, EIP-712 Signer)"]
        SPONSOR_FN["Edge Function: sponsor-gas\n(Circuit Breaker, Allowlist, Fail-Closed)"]
        RELAY_SPONSOR["Gas Sponsor Relayer EOA\n(0xD072... Pays ETH Gas Fees)"]
        RELAY_MINTER["Claim Distributor Signer EOA\n(0x0F79... Signs EIP-712 Claims)"]
    end

    %% Smart Contract Layer
    subgraph ContractLayer["On-Chain Smart Contracts (Base / Base Sepolia)"]
        KC["KurdCoin (KC) ERC-20 Token\n(10B Cap, Non-Recycling Burn, Pausable)"]
        DIST["KurdCoinMigrationDistributor\n(Merkle Proofs, Exactly-Once Claims)"]
    end

    %% Governance & Emergency Layer
    subgraph GovLayer["Decentralized Governance & Security Guardians"]
        SAFE["Gnosis Safe Multisig (3-of-5)\n(EVM Hardware Signers)"]
        TL["KurdCoinTimelock\n(24h - 48h Time Delay)"]
        GUARD["Emergency Guardian Key\n(Fast Pause Only, Zero Admin/Mint)"]
    end

    %% Data Connections
    U -->|Password / Auth| W
    W -->|Zero-Knowledge Decrypt| V
    V -->|Decrypted Key| EVM
    U -.->|Sign EIP-191 Ownership| EXT
    W -->|Authenticated API| AUTH
    AUTH -->|User Identity (auth.uid)| DB
    DB --> MINE_ENG

    %% Claim Flow
    MINE_ENG -->|Unclaimed Rewards| CLAIM_FN
    CLAIM_FN -->|Atomic DB Lease| DB
    CLAIM_FN -->|Distributor Key| RELAY_MINTER
    RELAY_MINTER -->|EIP-712 Typed Signature / Mint| KC

    %% Gas Sponsor Flow (Separated with 0 contract admin roles)
    W -.->|Request Sponsored Gas| SPONSOR_FN
    SPONSOR_FN -->|Advisory Locks & Circuit Breaker| DB
    SPONSOR_FN -->|Sponsor Key| RELAY_SPONSOR
    RELAY_SPONSOR -.->|Send Native ETH for Gas| EVM

    %% Migration Pipeline
    DB -->|Verified Snapshot at Cut-Off| SNAP["Finalized Migration Snapshot"]
    SNAP -->|Deterministic Leaves| MT["Cryptographic Merkle Tree"]
    MT -->|Root Hash| DIST
    EXT -->|Prove Entitlement with Proof| DIST
    DIST -->|1:1 KC Payout| EXT

    %% Governance Control
    SAFE -->|Propose / Execute| TL
    TL -->|DEFAULT_ADMIN_ROLE| KC
    TL -->|Owner| DIST
    GUARD -->|PAUSER_ROLE (Emergency Only)| KC
    GUARD -->|Pause Only| DIST
```

---

## 1. SUBSYSTEM WALKTHROUGHS

### A. Client Custody & Zero-Knowledge Vault Model
1. The user creates a master account using email/password.
2. A random 256-bit entropy seed is generated on the client machine via `window.crypto.getRandomValues()`.
3. An EVM private key and address are derived client-side.
4. The private key is encrypted using **AES-256-GCM** with a key derived via **PBKDF2** (100,000 iterations of HMAC-SHA-256), a unique 16-byte cryptographic salt, and a 12-byte initialization vector (IV).
5. Only the resulting ciphertext, salt, and IV are stored in `public.wallets.encrypted_vault`.
6. **Auditor Note:** Plaintext private keys, seed phrases, and passwords are never transmitted across the network, logged, or stored on Supabase.

### B. Off-Chain Mining Accounting & Time Barrier
1. Mining sessions run on a strictly server-authoritative 24-hour cycle.
2. The user calls `start_mining_session_rpc()`. The server records `started_at = now()`.
3. Completion via `complete_mining_session_rpc()` enforces:
   $$\text{ended\_at} \ge \text{started\_at} + \text{interval '24 hours'}$$
4. Client clock modification has zero impact on session duration or reward calculation.
5. Rewards are calculated based on active network miners (5-tier halving schedule, starting at 0.25 KC baseline), capped security circle bonuses (+20% max), and capped referral bonuses (+25% max).
6. Settled sessions append immutable records to `public.mining_session_rewards`.

### C. Exactly-Once Mining Claim Pipeline
1. When a user requests on-chain settlement, the client calls the `claim-mining-rewards` Edge Function.
2. The function validates the user's JWT session against Supabase Auth (`auth.uid()`).
3. An atomic PostgreSQL stored procedure (`reserve_mining_claim_rpc`):
   - Acquires transaction-level advisory locks.
   - Sums all unclaimed rewards from `public.mining_session_rewards`.
   - Binds the claim strictly to the user's registered `wallets.built_in_evm_address`.
   - Links session rewards to a new claim ID via junction table `public.mining_claim_sessions` with a hard `UNIQUE(session_reward_id)` constraint.
4. The server relayer signs an **EIP-712** typed authorization containing recipient address, amount in wei, sequential nonce, and expiration deadline.
5. The transaction is submitted to `KurdCoin.sol`, executing `claimWithAuthorization()`.
6. **Auditor Note:** The junction table's unique database constraint mathematically prevents a single session reward from being claimed twice.

### D. Gas Sponsorship Architecture (Decoupled Relayer)
1. The gas sponsor operates through a dedicated Edge Function (`sponsor-gas`) and relayer wallet (`0xD072F5...`).
2. **Critical Separation:** The gas sponsor holds **ZERO administrative roles** on the `KurdCoin.sol` token contract. It cannot mint, pause, burn, or alter permissions.
3. The function enforces:
   - Chain verification (Base Sepolia only on testnet; mainnet transfers strictly disabled).
   - Per-request cap (0.00015 ETH).
   - Per-user daily cap (0.0005 ETH).
   - Cooldown period (300 seconds).
   - Global 24-hour treasury circuit breaker (0.05 ETH hard ceiling).
   - PostgreSQL advisory locks (`pg_advisory_xact_lock`) ensuring serial reservation.

### E. Beta-to-Mainnet Migration Architecture
1. At the scheduled beta cut-off block height, `scripts/generateMigrationSnapshot.ts` queries all on-chain Base Sepolia balances and unclaimed claimable rewards.
2. Exclusions (79 internal QA accounts, deployer bootstrap 100 KC, relayer addresses, zero address) are filtered out.
3. Total entitlement is calculated using the strict non-double-counting formula:
   $$\text{Entitlement} = \text{Current On-Chain KC} + \text{Unclaimed Claimable KC}$$
4. An immutable cryptographic Merkle tree is generated using standard OpenZeppelin double-hashed leaves:
   $$\text{leaf} = \text{keccak256}(\text{bytes.concat}(\text{keccak256}(\text{abi.encode}(\text{index}, \text{account}, \text{amount}))))$$
5. The Merkle root is registered in `KurdCoinMigrationDistributor.sol` on Base Mainnet.
6. The distributor is funded with the exact total snapshot amount.
7. Migrating holders submit their Merkle proof directly to the distributor contract to claim their 1:1 tokens on Base Mainnet.

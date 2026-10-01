// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title KurdCoin (KC)
 * @notice Production-grade ERC-20 token with capped lifetime supply, role-based minting,
 *         pausability, burnability, and EIP-712 claim authorization.
 *
 * Security Architecture & Invariants:
 *   1. Lifetime Cap Invariant: `totalMinted <= cap()`. Burning tokens reduces circulating
 *      `totalSupply()`, but does NOT permit reminting beyond the original cap.
 *   2. Replay Protection: EIP-712 typed signature authorization binds recipient, amount,
 *      contract address, chainId, strictly sequential nonce, and expiration deadline.
 *   3. Least Privilege: Deployer is granted DEFAULT_ADMIN_ROLE and PAUSER_ROLE, but
 *      MINTER_ROLE is explicitly NOT granted in the constructor. It must be granted
 *      to a dedicated, secured server signer or multisig.
 *   4. Zero Transfer Tax / Zero Blacklist: Implements standard ERC-20 semantics for 100%
 *      compatibility with EVM decentralized exchanges (Aerodrome, Uniswap), aggregators,
 *      wallets, and centralized exchanges.
 *
 * Roles:
 *   DEFAULT_ADMIN_ROLE — role management (intended for multisig on Base mainnet)
 *   MINTER_ROLE        — authorized to mint tokens and sign EIP-712 claims
 *   PAUSER_ROLE        — emergency freeze of transfers
 */
contract KurdCoin is ERC20Capped, ERC20Burnable, ERC20Pausable, AccessControl, EIP712 {
    using ECDSA for bytes32;

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ─── EIP-712 ──────────────────────────────────────────────────────────────
    /// @dev Claim(address to,uint256 amount,uint256 nonce,uint256 deadline)
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address to,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    /// @notice Per-address claim nonce. Incremented after each successful claim to prevent replay.
    mapping(address => uint256) public claimNonces;

    /// @notice Total cumulative tokens minted over the contract's lifetime.
    /// @dev Prevents reminting of burned tokens beyond the immutable hard cap.
    uint256 public totalMinted;

    // ─── Events ───────────────────────────────────────────────────────────────
    event ClaimExecuted(
        address indexed to,
        uint256 amount,
        uint256 nonce,
        bytes32 indexed authorizationHash
    );

    // ─── Constructor ──────────────────────────────────────────────────────────
    /**
     * @param name_      Token name (e.g. "Kurd Coin", configurable for re-branding before mainnet).
     * @param symbol_    Token symbol (e.g. "KC").
     * @param maxSupply_ Maximum total supply in whole units (18 decimals applied internally).
     *                   Provisional simulation value: 10,000,000,000 (10 billion).
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_
    )
        ERC20(name_, symbol_)
        ERC20Capped(maxSupply_ * 10 ** decimals())
        EIP712(name_, "1")
    {
        require(maxSupply_ > 0, "KurdCoin: maxSupply must be > 0");
        require(bytes(name_).length > 0, "KurdCoin: name cannot be empty");
        require(bytes(symbol_).length > 0, "KurdCoin: symbol cannot be empty");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        // NOTE: MINTER_ROLE is intentionally NOT granted here to enforce separation of duties.
    }

    // ─── Minting ──────────────────────────────────────────────────────────────
    /**
     * @notice Directly mint tokens to an address.
     * @dev Restricted to MINTER_ROLE. Used for batch migration mints by authorized admin/multisig.
     * @param to     Recipient address (must not be zero address).
     * @param amount Amount in wei (18 decimal places).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(to != address(0), "KurdCoin: mint to zero address");
        require(amount > 0, "KurdCoin: amount must be > 0");
        require(totalMinted + amount <= cap(), "KurdCoin: total minted exceeds cap");

        totalMinted += amount;
        _mint(to, amount);
    }

    /**
     * @notice Claim tokens using a server-signed EIP-712 authorization.
     * @dev The authorization must be signed by an authorized MINTER_ROLE address.
     *      Nonces prevent replay attacks; deadlines prevent stale execution.
     *
     * @param to        Address to receive the minted tokens.
     * @param amount    Amount to mint (in wei).
     * @param nonce     Expected nonce for `to` (must match claimNonces[to]).
     * @param deadline  Unix timestamp after which authorization is invalid.
     * @param signature ECDSA signature from a MINTER_ROLE key over the EIP-712 digest.
     */
    function claimWithAuthorization(
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        require(block.timestamp <= deadline, "KurdCoin: authorization expired");
        require(nonce == claimNonces[to], "KurdCoin: invalid nonce");
        require(to != address(0), "KurdCoin: claim to zero address");
        require(amount > 0, "KurdCoin: amount must be > 0");
        require(totalMinted + amount <= cap(), "KurdCoin: total minted exceeds cap");

        // Reconstruct EIP-712 digest
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_TYPEHASH, to, amount, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        require(hasRole(MINTER_ROLE, signer), "KurdCoin: signer is not a minter");

        // CEI pattern: State effects before external call / mint
        claimNonces[to]++;
        totalMinted += amount;

        _mint(to, amount);

        emit ClaimExecuted(to, amount, nonce, structHash);
    }

    // ─── Emergency Pause ──────────────────────────────────────────────────────
    /**
     * @notice Pause all token transfers and mints. Emergency use only.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Resume token transfers and mints.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ─── Overrides ────────────────────────────────────────────────────────────
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}

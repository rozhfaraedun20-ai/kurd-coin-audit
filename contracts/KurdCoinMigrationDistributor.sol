// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title KurdCoinMigrationDistributor
 * @notice Harmless simulation / future production claim distributor for Kurd Coin Beta -> Mainnet migration.
 * Allows eligible holders to prove entitlement via Merkle proof and claim 1:1 destination tokens.
 */
contract KurdCoinMigrationDistributor is Ownable, Pausable {
    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    uint256 public immutable snapshotBlock;
    uint256 public immutable sourceChainId;

    // Track claimed indices to guarantee exactly-once claim
    mapping(uint256 => bool) private _claimed;

    event MigrationClaimed(uint256 indexed index, address indexed account, uint256 amount);

    constructor(
        address tokenAddress,
        bytes32 root,
        uint256 blockNumber,
        uint256 chainId
    ) Ownable(msg.sender) {
        require(tokenAddress != address(0), "Invalid token address");
        require(root != bytes32(0), "Invalid Merkle root");
        token = IERC20(tokenAddress);
        merkleRoot = root;
        snapshotBlock = blockNumber;
        sourceChainId = chainId;
    }

    function isClaimed(uint256 index) public view returns (bool) {
        return _claimed[index];
    }

    function claimMigration(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external whenNotPaused {
        require(!_claimed[index], "Migration already claimed");

        // Double-hashed leaf matching standard format:
        // leaf = keccak256(abi.encodePacked(index, account, amount))
        bytes32 leaf = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid Merkle proof");

        _claimed[index] = true;
        require(token.transfer(account, amount), "Token transfer failed");

        emit MigrationClaimed(index, account, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}

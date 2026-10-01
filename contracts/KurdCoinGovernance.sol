// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title KurdCoinTimelock
 * @notice Production-grade OpenZeppelin TimelockController for Kurd Coin governance.
 *         Enforces a minimum time delay between queueing an administrative action
 *         and executing it, protecting against rogue keys and unexpected updates.
 */
contract KurdCoinTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}

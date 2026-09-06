// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

/// @notice Deployment guard skeleton. Real deployment logic added after Spike 2.
/// @dev Hard rule (PRD v1.3 §20): mainnet EVM chain id 1776 is NOT DEPLOYED. This script reverts on any chain but 1439.
contract Deploy is Script {
    uint256 internal constant INJECTIVE_TESTNET = 1439;

    error WrongChain(uint256 got);

    function run() external {
        if (block.chainid != INJECTIVE_TESTNET) revert WrongChain(block.chainid);
        // vm.startBroadcast();
        // AFRTestUSD token = new AFRTestUSD();
        // EvidenceAnchor anchor = new EvidenceAnchor();
        // ClaimVault vault = new ClaimVault(address(token), operator);
        // vm.stopBroadcast();
        // -> write addresses to ../packages/verifier-cli/trust/trusted_signers.json via a TS post-step (not here).
    }
}

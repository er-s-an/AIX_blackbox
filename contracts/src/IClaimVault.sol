// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IClaimVault — PRD v1.3 §5.6 / ADR-008
/// @notice Test-asset payout with contract-level idempotency key = keccak256(abi.encode(claimRef, decisionVersion)).
/// @dev STATUS: interface only. NOT IMPLEMENTED. NOT DEPLOYED. Test asset AFR-TEST-USD only; no real funds.
interface IClaimVault {
    event Payout(bytes32 indexed key, bytes32 indexed claimRef, uint32 decisionVersion, address to, uint256 amount);
    event OperatorChanged(address indexed previous, address indexed next);

    error AlreadyExecuted();
    error NotOperator();
    error ZeroAmount();

    function token() external view returns (address);
    function operator() external view returns (address);
    function executed(bytes32 key) external view returns (bool);

    /// @notice Executes once per (claimRef, decisionVersion). Sets executed before transfer (CEI).
    function payout(bytes32 claimRef, uint32 decisionVersion, address to, uint256 amount) external;
}

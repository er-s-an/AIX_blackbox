// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEvidenceAnchor — PRD v1.3 §4.4 / ADR-007
/// @notice Public commitment registry keyed by (submitter, type, refId, version).
///         Stores commitment + block number so verifiers use eth_call, not historical receipts.
/// @dev STATUS: interface only. NOT IMPLEMENTED. NOT DEPLOYED. Testnet 1439 only.
interface IEvidenceAnchor {
    /// @dev uint8: 0 = AUTH (mandate commitment), 1 = PACKET (packet commitment)
    enum AnchorType {
        AUTH,
        PACKET
    }

    struct Record {
        bytes32 commitment;
        uint64 blockNumber;
    }

    event Anchored(
        address indexed submitter,
        uint8 indexed anchorType,
        bytes32 indexed refId,
        uint32 version,
        bytes32 commitment,
        uint64 blockNumber
    );

    /// @notice same key, different commitment
    error Conflict();
    /// @notice version must equal latest + 1 (unless idempotent rewrite of an existing identical record)
    error BadVersion();
    /// @notice anchorType must be 0 or 1
    error BadType();

    /// @notice Anchor a commitment. Idempotent: rewriting an existing (key) with the SAME commitment
    ///         returns silently (no event, no revert). Different commitment → Conflict.
    ///         New versions must be latest+1 → otherwise BadVersion.
    function anchor(uint8 anchorType, bytes32 refId, uint32 version, bytes32 commitment) external;

    function get(address submitter, uint8 anchorType, bytes32 refId, uint32 version)
        external
        view
        returns (bytes32 commitment, uint64 blockNumber);

    function latest(address submitter, uint8 anchorType, bytes32 refId) external view returns (uint32 version);
}

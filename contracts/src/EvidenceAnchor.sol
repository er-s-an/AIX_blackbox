// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IEvidenceAnchor} from "./IEvidenceAnchor.sol";
contract EvidenceAnchor is IEvidenceAnchor {
    mapping(bytes32 => Record) private records;
    mapping(bytes32 => uint32) private versions;
    error ZeroCommitment();
    function anchor(uint8 t, bytes32 refId, uint32 version, bytes32 commitment) external {
        if(t>1) revert BadType();
        if(commitment==bytes32(0)) revert ZeroCommitment();
        if(version==0) revert BadVersion();
        bytes32 base=keccak256(abi.encode(msg.sender,t,refId));
        bytes32 key=keccak256(abi.encode(msg.sender,t,refId,version));
        uint32 latestVersion=versions[base];
        if(version<=latestVersion){if(records[key].commitment!=commitment) revert Conflict();return;}
        if(version!=latestVersion+1) revert BadVersion();
        records[key]=Record(commitment,uint64(block.number));versions[base]=version;
        emit Anchored(msg.sender,t,refId,version,commitment,uint64(block.number));
    }
    function get(address submitter,uint8 t,bytes32 refId,uint32 version) external view returns(bytes32,uint64){Record memory r=records[keccak256(abi.encode(submitter,t,refId,version))];return(r.commitment,r.blockNumber);}
    function latest(address submitter,uint8 t,bytes32 refId) external view returns(uint32){return versions[keccak256(abi.encode(submitter,t,refId))];}
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IClaimVault} from "./IClaimVault.sol";
contract ClaimVault is IClaimVault {
    using SafeERC20 for IERC20;
    address public immutable token;
    address public operator;
    mapping(bytes32=>bool) public executed;
    mapping(bytes32=>bool) public paidClaims;
    error ZeroAddress(); error ClaimAlreadyPaid();
    constructor(address token_,address operator_){if(token_==address(0)||operator_==address(0))revert ZeroAddress();token=token_;operator=operator_;}
    function setOperator(address next) external {if(msg.sender!=operator)revert NotOperator();if(next==address(0))revert ZeroAddress();emit OperatorChanged(operator,next);operator=next;}
    function payout(bytes32 claimRef,uint32 decisionVersion,address to,uint256 amount) external {
        if(msg.sender!=operator)revert NotOperator();if(amount==0)revert ZeroAmount();if(to==address(0))revert ZeroAddress();
        bytes32 key=keccak256(abi.encode(claimRef,decisionVersion));
        if(executed[key])revert AlreadyExecuted();if(paidClaims[claimRef])revert ClaimAlreadyPaid();
        executed[key]=true;paidClaims[claimRef]=true;IERC20(token).safeTransfer(to,amount);
        emit Payout(key,claimRef,decisionVersion,to,amount);
    }
}

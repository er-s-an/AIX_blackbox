// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {EvidenceAnchor} from "../src/EvidenceAnchor.sol";
import {IEvidenceAnchor} from "../src/IEvidenceAnchor.sol";
import {ClaimVault} from "../src/ClaimVault.sol";
import {IClaimVault} from "../src/IClaimVault.sol";
import {AFRTestUSD} from "../src/AFRTestUSD.sol";
import {Deploy} from "../script/Deploy.s.sol";
contract AFRTest is Test {
 EvidenceAnchor a;AFRTestUSD t;ClaimVault v;bytes32 ref=keccak256("ref");bytes32 c=keccak256("commitment");
 function setUp() public {a=new EvidenceAnchor();t=new AFRTestUSD();v=new ClaimVault(address(t),address(this));t.mint(address(v),100 ether);}
 function testAnchorAndIdempotent() public {a.anchor(0,ref,1,c);(bytes32 got,uint64 blockNo)=a.get(address(this),0,ref,1);assertEq(got,c);assertEq(blockNo,block.number);vm.recordLogs();a.anchor(0,ref,1,c);assertEq(vm.getRecordedLogs().length,0);}
 function testConflict() public {a.anchor(0,ref,1,c);vm.expectRevert(IEvidenceAnchor.Conflict.selector);a.anchor(0,ref,1,keccak256("different"));}
 function testSkipVersion() public {vm.expectRevert(IEvidenceAnchor.BadVersion.selector);a.anchor(0,ref,3,c);}
 function testZeroAndBadType() public {vm.expectRevert(IEvidenceAnchor.BadType.selector);a.anchor(2,ref,1,c);vm.expectRevert(IEvidenceAnchor.BadVersion.selector);a.anchor(0,ref,0,c);}
 function testSeparateSubmittersAndTypes() public {a.anchor(0,ref,1,c);vm.prank(address(3));a.anchor(0,ref,1,keccak256("other"));a.anchor(1,ref,1,c);assertEq(a.latest(address(this),0,ref),1);assertEq(a.latest(address(3),0,ref),1);}
 function testFuzzAnchor(bytes32 x,uint8 raw) public {vm.assume(x!=bytes32(0));uint8 typ=raw%2;a.anchor(typ,ref,1,x);a.anchor(typ,ref,1,x);(bytes32 got,)=a.get(address(this),typ,ref,1);assertEq(got,x);}
 function testPayoutAndRepeat() public {v.payout(ref,1,address(7),8 ether);assertEq(t.balanceOf(address(7)),8 ether);vm.expectRevert(IClaimVault.AlreadyExecuted.selector);v.payout(ref,1,address(7),8 ether);vm.expectRevert(ClaimVault.ClaimAlreadyPaid.selector);v.payout(ref,2,address(7),8 ether);}
 function testUnauthorized() public {vm.prank(address(4));vm.expectRevert(IClaimVault.NotOperator.selector);v.payout(ref,1,address(7),8 ether);}
 function testPayoutFailureAllowsRetry() public {vm.expectRevert();v.payout(ref,1,address(7),101 ether);assertFalse(v.paidClaims(ref));t.mint(address(v),2 ether);v.payout(ref,1,address(7),101 ether);assertTrue(v.paidClaims(ref));}
 function testDeploymentGuard() public {Deploy d=new Deploy();vm.chainId(1776);vm.expectRevert(abi.encodeWithSelector(Deploy.WrongChain.selector,1776));d.run();vm.chainId(1439);d.run();}
}

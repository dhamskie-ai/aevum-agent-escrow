// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {AgentEscrow} from "../src/AgentEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

contract AgentEscrowTest is Test {
    MockERC20 token;
    AgentEscrow escrow;
    address payer = address(1);
    address worker = address(2);
    address arbiter = address(3);
    address stranger = address(4);
    uint256 constant AMOUNT = 100e6;

    function setUp() public {
        token = new MockERC20();
        escrow = new AgentEscrow(address(token));
        token.mint(payer, 1_000e6);
        vm.prank(payer);
        token.approve(address(escrow), type(uint256).max);
    }

    function create() internal returns (uint256) {
        vm.prank(payer);
        return escrow.createEscrow(worker, arbiter, AMOUNT, block.timestamp + 1 days);
    }

    function testCreateDeliverRelease() public {
        uint256 id = create();
        vm.prank(worker);
        escrow.markDelivered(id);
        vm.prank(payer);
        escrow.release(id);
        assertEq(token.balanceOf(worker), AMOUNT);
        assertEq(token.balanceOf(payer), 900e6);
        assertEq(uint256(escrow.getEscrow(id).status), uint256(AgentEscrow.Status.Released));
    }

    function testCreateReverts() public {
        vm.prank(payer);
        vm.expectRevert("amount is zero");
        escrow.createEscrow(worker, arbiter, 0, block.timestamp + 1);
        vm.expectRevert("deadline not future");
        escrow.createEscrow(worker, arbiter, 1, block.timestamp);
        vm.expectRevert("worker is zero");
        escrow.createEscrow(address(0), arbiter, 1, block.timestamp + 1);
        vm.expectRevert("arbiter is zero");
        escrow.createEscrow(worker, address(0), 1, block.timestamp + 1);
    }

    function testReleaseGuards() public {
        uint256 id = create();
        vm.prank(payer);
        vm.expectRevert("not delivered");
        escrow.release(id);
        vm.prank(worker);
        escrow.markDelivered(id);
        vm.prank(payer);
        escrow.release(id);
        vm.prank(payer);
        vm.expectRevert("not delivered");
        escrow.release(id);
    }

    function testAutoReleaseAfterDeadline() public {
        uint256 id = create();
        vm.prank(worker);
        escrow.markDelivered(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(stranger);
        escrow.release(id);
        assertEq(token.balanceOf(worker), AMOUNT);
    }

    function testRefundAfterDeadline() public {
        uint256 id = create();
        vm.warp(block.timestamp + 1 days);
        vm.prank(stranger);
        vm.expectRevert("only payer");
        escrow.refund(id);
        vm.prank(payer);
        escrow.refund(id);
        assertEq(token.balanceOf(payer), 1_000e6);
    }

    function testDisputeResolve6040() public {
        uint256 id = create();
        vm.prank(worker);
        escrow.markDelivered(id);
        vm.prank(worker);
        escrow.dispute(id);
        vm.prank(arbiter);
        escrow.resolveByArbiter(id, 60e6);
        assertEq(token.balanceOf(worker), 60e6);
        assertEq(token.balanceOf(payer), 940e6);
    }

    function testDisputeGuards() public {
        uint256 id = create();
        vm.prank(stranger);
        vm.expectRevert("only parties");
        escrow.dispute(id);
        vm.prank(payer);
        escrow.dispute(id);
        vm.prank(stranger);
        vm.expectRevert("only arbiter");
        escrow.resolveByArbiter(id, 1);
        vm.prank(arbiter);
        vm.expectRevert("worker amount exceeds escrow");
        escrow.resolveByArbiter(id, AMOUNT + 1);
    }

    function testMarkDeliveredOnlyWorker() public {
        uint256 id = create();
        vm.prank(payer);
        vm.expectRevert("only worker");
        escrow.markDelivered(id);
    }
}

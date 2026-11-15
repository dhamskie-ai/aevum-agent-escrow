// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

contract AgentEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Active,
        Delivered,
        Released,
        Disputed,
        Resolved,
        Refunded
    }

    struct Escrow {
        uint256 id;
        address payer;
        address worker;
        address arbiter;
        uint256 amount;
        uint256 deadline;
        Status status;
    }

    IERC20 public immutable token;
    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) private escrows;

    event EscrowCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed worker,
        address arbiter,
        uint256 amount,
        uint256 deadline
    );
    event Delivered(uint256 indexed id);
    event Released(uint256 indexed id, address indexed worker, uint256 amount);
    event Refunded(uint256 indexed id, address indexed payer, uint256 amount);
    event Disputed(uint256 indexed id, address indexed initiator);
    event Resolved(uint256 indexed id, uint256 workerAmount, uint256 payerAmount);

    constructor(address token_) {
        require(token_ != address(0), "token is zero");
        token = IERC20(token_);
    }

    function createEscrow(address worker, address arbiter, uint256 amount, uint256 deadline)
        external
        nonReentrant
        returns (uint256 id)
    {
        require(amount > 0, "amount is zero");
        require(worker != address(0), "worker is zero");
        require(arbiter != address(0), "arbiter is zero");
        require(worker != msg.sender && arbiter != msg.sender, "party cannot be payer");
        require(deadline > block.timestamp, "deadline not future");
        id = nextEscrowId++;
        escrows[id] = Escrow(id, msg.sender, worker, arbiter, amount, deadline, Status.Active);
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowCreated(id, msg.sender, worker, arbiter, amount, deadline);
    }

    function markDelivered(uint256 id) external {
        Escrow storage e = _escrow(id);
        require(msg.sender == e.worker, "only worker");
        require(e.status == Status.Active, "not active");
        e.status = Status.Delivered;
        emit Delivered(id);
    }

    function release(uint256 id) external nonReentrant {
        Escrow storage e = _escrow(id);
        require(e.status == Status.Delivered, "not delivered");
        require(msg.sender == e.payer || block.timestamp >= e.deadline, "not authorized");
        e.status = Status.Released;
        token.safeTransfer(e.worker, e.amount);
        emit Released(id, e.worker, e.amount);
    }

    function refund(uint256 id) external nonReentrant {
        Escrow storage e = _escrow(id);
        require(msg.sender == e.payer, "only payer");
        require(e.status == Status.Active, "not active");
        require(block.timestamp >= e.deadline, "deadline not reached");
        e.status = Status.Refunded;
        token.safeTransfer(e.payer, e.amount);
        emit Refunded(id, e.payer, e.amount);
    }

    function dispute(uint256 id) external {
        Escrow storage e = _escrow(id);
        require(msg.sender == e.payer || msg.sender == e.worker, "only parties");
        require(e.status == Status.Active || e.status == Status.Delivered, "not disputable");
        e.status = Status.Disputed;
        emit Disputed(id, msg.sender);
    }

    function resolveByArbiter(uint256 id, uint256 workerAmount) external nonReentrant {
        Escrow storage e = _escrow(id);
        require(msg.sender == e.arbiter, "only arbiter");
        require(e.status == Status.Disputed, "not disputed");
        require(workerAmount <= e.amount, "worker amount exceeds escrow");
        uint256 payerAmount = e.amount - workerAmount;
        e.status = Status.Resolved;
        if (workerAmount > 0) token.safeTransfer(e.worker, workerAmount);
        if (payerAmount > 0) token.safeTransfer(e.payer, payerAmount);
        emit Resolved(id, workerAmount, payerAmount);
    }

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return _escrow(id);
    }

    function _escrow(uint256 id) internal view returns (Escrow storage e) {
        e = escrows[id];
        require(e.id != 0, "escrow not found");
    }
}

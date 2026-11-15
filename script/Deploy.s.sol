// Deploy with:
// forge script script/Deploy.s.sol --rpc-url https://rpc-test.qday.info --broadcast
// Set DEPLOYER_PRIVATE_KEY in the environment; never place the key in source control.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentEscrow} from "../src/AgentEscrow.sol";

contract Deploy is Script {
    address internal constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external returns (AgentEscrow escrow) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        escrow = new AgentEscrow(TUSD8);
        vm.stopBroadcast();
        console2.log("AgentEscrow deployed at:", address(escrow));
    }
}

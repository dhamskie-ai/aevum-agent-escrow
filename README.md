# AgentEscrow

Paying for work performed by an AI agent or a person carries risk: pay first and the worker may disappear, or do the work first and the payer may refuse to pay. AgentEscrow holds tUSD8 in a smart contract until work is delivered. The payer can release payment after delivery; if the payer does nothing until the deadline, anyone can trigger release to the worker. Either party can open a dispute, and the appointed arbiter decides how the escrow is split. If work is never delivered by the deadline, the payer can reclaim the funds.

## Architecture and flow

```text
Payer approves tUSD8, then creates and funds escrow
                         |
              +----------+----------+
              |                     |
       Worker delivers         No delivery by deadline
              |                     |
        Delivered status       Payer calls refund
          /       \
 Payer releases    Dispute raised by payer or worker
          |                     |
       Released       Arbiter resolves the split
                                |
                            Resolved

If delivered but payer takes no action until deadline:
any account can call release -> payment goes to worker
```

The deadline paths are explicit contract calls, not background automation. After delivery and the deadline, any account may call `release`; before delivery, only the payer may call `refund` after the deadline. A dispute prevents release or refund until the arbiter resolves it.

Roles:

- **Payer** funds an escrow, may release after delivery, may raise a dispute, and may refund an active escrow after its deadline.
- **Worker** receives funds on release, marks work delivered, and may raise a dispute.
- **Arbiter** resolves a disputed escrow by specifying the amount paid to the worker. The remainder returns to the payer.

Statuses: `Active` (funded, not yet delivered), `Delivered` (worker marked delivery), `Released` (worker paid), `Disputed` (awaiting arbiter), `Resolved` (arbiter split funds), and `Refunded` (payer reclaimed funds after a missed delivery deadline).

## Project structure

- `src/AgentEscrow.sol` — escrow contract, state transitions, token transfers, and role checks.
- `test/AgentEscrow.t.sol` — Foundry tests for creation, delivery, release, refunds, disputes, and access guards.
- `test/MockERC20.sol` — test token used by the contract tests.
- `script/Deploy.s.sol` — deploys AgentEscrow configured with the testnet tUSD8 token.
- `ui/` — static browser UI (`index.html`, `style.css`, `app.js`); uses ethers v6 from a CDN and MetaMask.
- `foundry.toml` — Foundry project configuration and Solidity compiler version.

## Requirements

- [Foundry](https://getfoundry.sh/) (`forge` and `cast`)
- Node.js 20 or later and npm
- MetaMask for the browser demo

## Setup and tests

```sh
git clone <repository-url>
cd agent-escrow
forge install
forge test
forge build
```

`forge install` installs the repository's declared Git submodules, including OpenZeppelin Contracts and `forge-std`. The current test suite has 8 tests and is expected to pass with `forge test`.

## Deploy to QDay Aevum testnet

The deployment script reads `DEPLOYER_PRIVATE_KEY` from the environment. Fund the corresponding account with testnet gas from the faucet, then run:

```sh
export DEPLOYER_PRIVATE_KEY=<your-testnet-private-key>
forge script script/Deploy.s.sol \
  --rpc-url https://rpc-test.qday.info \
  --broadcast
```

Do not commit or share the private key. The script deploys AgentEscrow with the tUSD8 token address listed below. Once deployment succeeds, record its contract address and transaction hash in the deployment section and configure the address in `ui/app.js` before using the UI. The UI currently contains a zero-address placeholder, so its escrow actions stay unavailable until configured.

## Browser demo

The contract has not been deployed as of this README, so the UI cannot yet create or interact with real testnet escrows. After deploying it and configuring the UI contract address:

1. Serve the static UI from the repository root:

   ```sh
   python3 -m http.server 8000
   ```

   Open `http://localhost:8000/ui/` in a browser.
2. Connect MetaMask. The UI requests Aevum Testnet (chain ID `44005`) and offers to add it if it is missing.
3. Request tUSD8 from the faucet. You will also need testnet tQDAY for transaction gas.
4. Create an escrow with separate payer, worker, and arbiter accounts. The UI requests a token approval first, then submits `createEscrow` to lock the chosen tUSD8 amount.
5. Connect as the worker and choose **Mark delivered**. Connect as the payer and choose **Release** to pay the worker.
6. For a dispute scenario, have either the payer or worker choose **Dispute**, then connect as the arbiter and resolve with the tUSD8 amount assigned to the worker. The remainder returns to the payer.
7. For the deadline scenarios, wait until the deadline. If the escrow is still `Active`, the payer can choose **Refund**. If it is `Delivered` and the payer has not released it, any account can trigger **Release**, which pays the worker.

The UI is a static app and imports ethers v6 from a CDN, so the browser needs network access. Each transaction requires a MetaMask confirmation.

## Testnet addresses and links

- Network: QDay Aevum Testnet
- Chain ID: `44005`
- RPC: <https://rpc-test.qday.info>
- Block explorer: <https://explorer-test.qday.info>
- Faucet: <https://faucet.qday.info/en>
- Demo token: tUSD8 at `0x456569838f1d43009A91ebA4263147Afd7233483` (6 decimals)

## Deployment (testnet)

AgentEscrow is **not deployed yet**. Deployment is pending testnet gas availability.

- Contract address: **TBD (to be filled in after deployment)**
- Deploy transaction: **TBD**
- Explorer link: **TBD**

## Security notes

- This project targets a testnet only. It is not intended for mainnet use and the demo token is not real money.
- Token transfers use OpenZeppelin `SafeERC20`, and state-changing transfer paths use `ReentrancyGuard`'s `nonReentrant` protection.
- Role checks restrict delivery to the worker, refunds to the payer, and resolution to the arbiter. Deadline checks gate refunds and permissionless release after delivery.
- The payer must approve tUSD8 separately before `createEscrow` can transfer funds. The UI handles this as a separate transaction.
- Review and audit the contracts before any use involving valuable assets.

## Roadmap

- Evaluate a mainnet release after security review and audit.
- Explore ERC-8004 identity integration for agents and counterparties.
- Add session keys and budget caps for constrained agent payments.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

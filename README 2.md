# AI Governance on GenLayer Studio

An on-chain AI-powered governance app. Users submit proposals; an Intelligent Contract running on **GenLayer Studio** evaluates each one with an LLM via equivalence-principle consensus and returns **APPROVE** or **REJECT** with a reason. All decisions are recorded on-chain and gas-free.

- **Live app:** https://genlayer-governance.lovable.app
- **Contract address:** `0xb680071Fae37320BeA1D5EF7375Fc81f7a342DcE`
- **Network:** GenLayer Studio (Chain ID `61999`)
- **RPC:** `https://studio.genlayer.com/api`
- **Explorer:** https://explorer-studio.genlayer.com/

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [The Intelligent Contract](#the-intelligent-contract)
6. [Frontend Integration](#frontend-integration)
7. [Local Development](#local-development)
8. [Deploying the Contract](#deploying-the-contract)
9. [Pointing the Frontend at Your Contract](#pointing-the-frontend-at-your-contract)
10. [Wallets](#wallets)
11. [Troubleshooting](#troubleshooting)
12. [Roadmap](#roadmap)
13. [License](#license)

---

## What it does

Traditional DAO governance relies on token-weighted voting that is slow, easy to manipulate, and often uninformed. This app replaces the voting layer with an **AI evaluator that lives inside the smart contract itself**. Every proposal is judged on five criteria:

1. **Clarity** — is the proposal well-defined?
2. **Feasibility** — is it realistically achievable?
3. **Benefit** — does it help the community?
4. **Safety** — does it avoid harm, fraud, or malicious intent?
5. **Legality & ethics** — is it legal and ethical?

The LLM returns a strict JSON verdict (`APPROVE` / `REJECT` + reason). To prevent any single validator's model output from dictating the result, GenLayer's **equivalence principle** is used: multiple validators independently call the LLM and must agree on the decision field for the transaction to finalize.

---

## Architecture

```
┌─────────────────┐        writeContract           ┌──────────────────────────┐
│  React Frontend │ ─────────────────────────────► │  GenLayer Studio RPC     │
│  (TanStack)     │                                │  https://studio          │
│                 │ ◄──────── readContract ─────── │  .genlayer.com/api       │
└─────────────────┘                                └────────────┬─────────────┘
                                                                │
                                                                ▼
                                                    ┌──────────────────────────┐
                                                    │  AIGovernance Contract   │
                                                    │  (Python, GenVM)         │
                                                    │                          │
                                                    │  submit_proposal() ──┐   │
                                                    │                      ▼   │
                                                    │   gl.eq_principle        │
                                                    │   .prompt_comparative    │
                                                    │      → LLM x N validators│
                                                    │      → consensus on      │
                                                    │        APPROVE/REJECT    │
                                                    └──────────────────────────┘
```

---

## Tech Stack

**Frontend**
- [TanStack Start](https://tanstack.com/start) v1 (React 19 + Vite 7, SSR-ready)
- TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui
- [genlayer-js](https://www.npmjs.com/package/genlayer-js) SDK
- viem (under the hood for typing/encoding)
- sonner (toasts), lucide-react (icons), framer-motion-ready

**Smart Contract**
- Python Intelligent Contract for the **GenVM** runtime
- `py-genlayer:test` standard library
- LLM access via `gl.nondet.exec_prompt`
- Consensus via `gl.eq_principle.prompt_comparative`

**Network**
- GenLayer Studio (sandbox network), gasless

---

## Project Structure

```
.
├── contracts/
│   └── ai_governance.py        # The Intelligent Contract (deploy this on Studio)
├── src/
│   ├── lib/
│   │   └── genlayer.ts         # SDK clients, chain config, wallet helpers
│   ├── routes/
│   │   ├── __root.tsx
│   │   └── index.tsx           # Main UI: submit proposals + decisions feed
│   ├── components/ui/          # shadcn components
│   └── styles.css              # Design tokens (oklch)
├── package.json
├── vite.config.ts
└── README.md
```

---

## The Intelligent Contract

File: `contracts/ai_governance.py`

Storage:
- `proposals: TreeMap[u256, str]` — id → proposal text
- `decisions: TreeMap[u256, str]` — id → `"APPROVE"` | `"REJECT"`
- `reasons:   TreeMap[u256, str]` — id → AI reasoning
- `proposers: TreeMap[u256, str]` — id → submitter address
- `next_id:   u256`

Public methods:
| Method | Kind | Purpose |
| --- | --- | --- |
| `get_proposal_count()` | view | Total proposals submitted |
| `get_proposal(id)` | view | Single proposal record |
| `get_all_proposals()` | view | All proposals (frontend feed) |
| `submit_proposal(text)` | write | Runs the LLM evaluation, stores the decision |

Inside `submit_proposal`, the prompt is wrapped in a function `evaluate()` and passed to:

```python
gl.eq_principle.prompt_comparative(
    evaluate,
    "The two outputs must agree on the decision field (APPROVE or REJECT). "
    "Reasons may differ in wording.",
)
```

This is the heart of GenLayer: **multiple validators run the LLM call independently** and the transaction only finalizes if they reach equivalent decisions. The contract then parses the JSON, falls back to keyword detection if parsing fails, and writes the result on-chain.

---

## Frontend Integration

File: `src/lib/genlayer.ts`

```ts
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const STUDIO_CHAIN = {
  id: 61999,
  name: "GenLayer Studio",
  hexId: "0xF22F",
  rpcUrl: "https://studio.genlayer.com/api",
  explorer: "https://explorer-studio.genlayer.com/",
};

export const DEFAULT_CONTRACT_ADDRESS =
  "0xb680071Fae37320BeA1D5EF7375Fc81f7a342DcE";
```

A burner key is generated and persisted in `localStorage` so the user can submit transactions immediately, with no wallet install required. MetaMask is supported as an **identity layer** (display + chain-add helper); since Studio is gasless, the burner account always signs the transaction.

Reading proposals:

```ts
const client = makeReadClient();
const proposals = await client.readContract({
  address: contractAddr,
  functionName: "get_all_proposals",
  args: [],
});
```

Submitting a proposal:

```ts
const client = makeWriteClient();
const hash = await client.writeContract({
  address: contractAddr,
  functionName: "submit_proposal",
  args: [proposalText],
  value: 0n,
});

await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.ACCEPTED,
});
```

---

## Local Development

Requirements: [Bun](https://bun.sh/) (or Node 20+).

```bash
bun install
bun run dev
```

Open http://localhost:3000.

The app connects to the public Studio RPC out of the box — no `.env` required for the default contract.

Optional environment variable:
```
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
```

---

## Deploying the Contract

1. Open the [GenLayer Studio IDE](https://studio.genlayer.com/).
2. Create a new contract and paste the contents of `contracts/ai_governance.py`.
3. Click **Deploy**. Studio is gasless, so no funding step is required.
4. Copy the deployed address from the Studio sidebar / explorer.
5. Verify it on the [Studio Explorer](https://explorer-studio.genlayer.com/).

---

## Pointing the Frontend at Your Contract

Two options:

**Option A — change the default in code**
Edit `src/lib/genlayer.ts`:
```ts
export const DEFAULT_CONTRACT_ADDRESS = "0xYOUR_NEW_ADDRESS";
```

**Option B — override at runtime**
Set `localStorage.ai_gov_contract_address` to your address (the helpers `getContractAddress` / `setContractAddress` already use this key).

---

## Wallets

- **Burner wallet** (default) — a private key is generated client-side and stored in `localStorage` under `ai_gov_account_pk`. It is auto-funded on Studio.
- **MetaMask** — click *Connect MetaMask*. The app will request `eth_requestAccounts`, then call `wallet_switchEthereumChain` (and `wallet_addEthereumChain` if needed) for chain `0xF22F` (61999). Because Studio is gasless, the burner key still signs transactions — MetaMask is shown as the active identity.

To clear your burner identity, run in DevTools:
```js
localStorage.removeItem("ai_gov_account_pk");
```

---

## Troubleshooting

**"Address `undefined` is invalid"**
The SDK was passed an undefined account. Make sure `makeWriteClient()` returns a client constructed with `getOrCreateAccount()` (the burner). MetaMask is not used to sign on Studio.

**Submission "times out" but the proposal still appears after refresh**
Studio occasionally takes longer than the SDK's default poll window to reach `ACCEPTED`. The app catches that timeout and refreshes after ~1.5s, by which time validators have written state. The transaction is real — check the explorer.

**MetaMask says "Unrecognized chain"**
Approve the *Add network* prompt; the app sends:
```
chainId:    0xF22F  (61999)
chainName:  GenLayer Studio
rpcUrls:    https://studio.genlayer.com/api
explorer:   https://explorer-studio.genlayer.com/
```

**Reads work, writes fail with a contract error**
Confirm the deployed contract address is correct and that the contract was deployed from the exact `contracts/ai_governance.py` in this repo (the ABI is inferred from the Python signatures).

---

## Roadmap

- Per-proposal voting weight via on-chain reputation
- Multi-criterion scoring (return individual scores, not just APPROVE/REJECT)
- Proposal categories (treasury, hiring, partnerships) with category-specific prompts
- Appeal flow: re-evaluate with a stricter equivalence principle
- Mainnet deployment once GenLayer mainnet is live

---

## License

MIT

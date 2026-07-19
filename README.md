# bleap-recover

> 📖 **New to this?** Read the [step-by-step recovery guide](docs/GUIDE.md).

A **builder-only** command-line tool for recovering funds stuck in a
[Bleap](https://bleap.finance) Magic Wallet (a [ZeroDev](https://zerodev.app) **Kernel v3.1** /
ERC-4337 smart account) on an EVM chain — typically when the wallet exists on several chains but
the app only lets you operate it on some of them, and you need to move funds out via the
co-signing module's **Slow-Withdrawal** path.

## ⚠️ The single most important thing

**This tool never reads, asks for, or stores a private key. It never signs anything, and it never
broadcasts a transaction.**

Every command does exactly one of two things:

- prints a **read-only status report**, or
- prints an **unsigned transaction request** (`chainId`, `to`, `data`, `value`) or a raw 32-byte
  hash for **you** to sign and send yourself, in a wallet you already trust (Rabby, MetaMask, a
  hardware wallet, …).

There is **no `--private-key` flag anywhere in this codebase, by design** — `grep -ri "privateKey\|--private-key" src/`
if you don't believe it. The wallet owner stays in sole control of their keys at every step.

## How Slow-Withdrawal recovery works

A Bleap Magic Wallet is a Kernel v3.1 smart account with the same CREATE2 address on every EVM
chain. Its `CosigningModuleV1` exposes a permissionless **Slow-Withdrawal** escape hatch: the
wallet owner triggers a timelock, waits it out, then submits a single ERC-4337 UserOperation —
signed by the owner's own ECDSA key — that sweeps one asset to any destination. No Bleap
involvement is required.

```
module-deploy ─┐                        (skip both if the wallet is
wallet-deploy ─┴─► withdraw-start ─► [wait timelock] ─► withdraw-sign ─► withdraw-submit
   prerequisites        trigger                            build UserOp      handleOps
```

## Requirements

- Node.js **≥ 20**
- An RPC endpoint for the target chain (the built-in registry covers ethereum, arbitrum, base,
  optimism, polygon, bsc; use `--rpc` for anything else)
- Your wallet software of choice, to sign and broadcast what this tool prints

## Install

```bash
git clone https://github.com/Bahamutnelson/bleap-recover.git
cd bleap-recover
npm install
```

Run it directly during use:

```bash
npx tsx src/cli.ts <command> [options]
```

Or install the `bleap-recover` binary globally:

```bash
npm run build   # tsc -> dist/
npm link        # exposes `bleap-recover`
```

## Quick start

### 1. Check where things stand (read-only)

```bash
bleap-recover status \
  --wallet 0xYourBleapWallet \
  --chain  bsc \
  --id     0xYourRootPermissionId \
  --owner  0xYourSignerAddress
```

Example output:

```
Bleap recovery status
  module deployed:   true
  deterministic dep: true
  wallet deployed:   true
  signer id:         0xYourRootPermissionId
  signer owner:      0xYourSignerAddress
  Slow-Withdrawal:   triggeredAt=0 remaining=0s timelock=86400s
  native balance:    0 wei
```

`signer owner` is read from `signers[wallet][id]` on-chain — confirm it matches the address your
recovery key derives to before going further. A `native balance` of `0` means the stuck funds are
an ERC-20; add `--token 0x…` to inspect a specific token, and use `--token` on `withdraw-sign`
later.

### 2. (Only if needed) deploy the prerequisites

Both are permissionless CREATE2 replays — anyone can send them, and the resulting address is
identical on every chain. **Skip both if `status` already shows the wallet deployed on the target
chain.**

```bash
# co-signing module, via the deterministic (Nick's Method) deployer
bleap-recover build module-deploy --chain bsc

# the wallet contract itself, replaying its deployWithFactory creation calldata
bleap-recover build wallet-deploy \
  --wallet       0xYourBleapWallet \
  --chain        bsc \
  --source-chain arbitrum \
  --tx-hash      0xTheOriginalDeployTxOnArbitrum
# (or pass --creation-data 0x… directly instead of --tx-hash/--source-chain)
```

### 3. Trigger the timelock

This one is **not** permissionless — it must be sent by the owner key itself
(`msg.sender == your signer address`).

```bash
bleap-recover build withdraw-start \
  --wallet 0xYourBleapWallet \
  --chain  bsc \
  --id     0xYourRootPermissionId
```

Paste the printed `data` into your wallet's raw-transaction field and send it from the owner key.
Re-run `status` to watch `remaining=…s` count down (default 24 h).

### 4. Once the timelock has elapsed, build and sign the withdrawal

```bash
bleap-recover build withdraw-sign \
  --wallet 0xYourBleapWallet \
  --chain  bsc \
  --to     0xYourDestination \
  --amount 1000000000000000000 \
  --out    userop.json
# ERC-20 instead of native: add --token 0xTokenAddress (amount is in the token's smallest unit)
```

- If a `depositTx` is printed first, send it before signing — it tops up the wallet's EntryPoint
  gas deposit (needed when the wallet holds no native token).
- **`personal_sign` the printed 32-byte hash** in your wallet. Sign the exact hash — do **not**
  route it through a UI that re-hashes or prefixes the string again.

### 5. Submit

```bash
bleap-recover build withdraw-submit \
  --wallet      0xYourBleapWallet \
  --chain       bsc \
  --userop-json userop.json \
  --signature   0xYourSignature \
  --beneficiary 0xYourDestination
```

Any funded account can broadcast the printed `handleOps` transaction; the swept funds go to your
chosen destination. Recover **one asset at a time** — repeat steps 4–5 per token.

## Options reference

`--chain` / `--source-chain` accept a numeric chain id (`56`) or a registry name (`ethereum`,
`arbitrum`, `base`, `optimism`, `polygon`, `bsc`). Use `--rpc` / `--source-rpc` for a custom RPC
or an unlisted chain id.

| Command | Key options |
|---|---|
| `status` | `--wallet`, `--chain`, `--rpc`, `--id`, `--owner`, `--token` |
| `build module-deploy` | `--chain`, `--rpc` |
| `build wallet-deploy` | `--wallet`, `--chain`, `--rpc`, `--source-chain`, `--source-rpc`, `--tx-hash`, `--creation-data` |
| `build withdraw-start` | `--wallet`, `--chain`, `--id` |
| `build withdraw-sign` | `--wallet`, `--chain`, `--rpc`, `--to`, `--token`, `--amount`, `--out` |
| `build withdraw-submit` | `--wallet`, `--chain`, `--rpc`, `--userop-json`, `--signature`, `--beneficiary` |

## Reference addresses

Fixed, chain-independent (CREATE2) contracts this tool targets:

| Contract | Address |
|---|---|
| CosigningModuleV1 | `0x61576D9ef23514bfe6F080E22CcFFf473cf11A1A` |
| Wallet factory (FactoryStaker) | `0xd703aaE79538628d27099B8c4f621bE4CCd142d5` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Deterministic deployer (Nick's Method) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

## Running the tests

Deterministic unit tests (no network) — the CI gate:

```bash
npx tsc --noEmit
npx vitest run --exclude '**/tests/fork/**'
```

The fork suite (`tests/fork/*.fork.test.ts`) validates the builders against real on-chain state
and a local Anvil fork (it deploys the module + a wallet and proves a full native + ERC-20
recovery moves funds). It needs [Foundry](https://book.getfoundry.sh/)'s `anvil` on your PATH and
a `.env.test` with **public** values only:

```bash
cp .env.test.example .env.test   # then fill in RPC URLs + public addresses
npx vitest run                   # includes the fork suite
```

| Variable | Meaning |
|---|---|
| `ARB_FORK_RPC` | A source-chain RPC where the wallet is already deployed |
| `BLEAP_TEST_WALLET` | A deployed Kernel-v3.1 wallet with the cosigning module installed |
| `BLEAP_TEST_PERMISSION_ID` | The wallet's ROOT permissionId, bytes32 left-aligned (4-byte id + 28 zero bytes) |
| `BLEAP_TEST_OWNER` | The address registered as `signers[wallet][permissionId]` |
| `BLEAP_TEST_WALLET_TX` | A real `deployWithFactory` tx hash on the source chain |
| `ETH_FORK_RPC` | A target-chain RPC where `BLEAP_TEST_WALLET` is not yet deployed |

Never put a private key in `.env.test` (or anywhere else) — this tool has no use for one.

## Design notes

- **Builder-only by construction.** The tool ends every path at an unsigned `TxRequest` or a hash.
  The only signing verb in the flow, `withdraw-sign`, emits a hash for *you* to sign elsewhere.
- **Multi-chain.** `resolveChain` takes an id or a name and falls back to a synthetic entry when
  you pass `--rpc` for an unlisted id, so the same commands work on any EVM chain.
- **Lossless UserOp round-trip.** `withdraw-sign` serializes the UserOp's `bigint` fields to
  decimal strings in `userop.json`; `withdraw-submit --userop-json` decodes them back before
  re-hashing, so nothing drifts between the two steps.
- **No hidden state.** Every command re-derives what it needs from on-chain reads and your flags.
  The only file it ever writes is the `userop.json` you request with `--out`.

## License

MIT

# bleap-recover — step-by-step recovery guide

This guide walks through recovering funds from a Bleap Magic Wallet (ZeroDev **Kernel v3.1**
smart account) using the module's **Slow-Withdrawal** escape hatch, end to end.

> **Read this first.** `bleap-recover` is a *transaction builder*. It never asks for, reads, or
> stores a private key, it never signs, and it never broadcasts. Every step below ends with the
> tool **printing** something for *you* to sign and send in your own wallet. You stay in sole
> control of your keys the whole time.

All addresses below are **placeholders** — substitute your own. Nothing in this guide is specific
to any real wallet.

---

## 0. What you need before you start

| Requirement | Why |
|---|---|
| Node.js ≥ 20 | to run the CLI |
| The wallet address | the Bleap smart-account address (same on every chain) |
| Your **root permissionId** | identifies the recovery permission; used as the module `id` |
| Your **signer address** | the EOA registered as `signers[wallet][id]` — the key that authorizes recovery |
| A little of the chain's native gas token | to send the trigger tx, the gas prefund, and the final submit |
| Your wallet software | Rabby, MetaMask, or a hardware wallet — to sign & broadcast |

If you don't know your `id` / signer, run `status` (below) — it reads the registered signer
straight from the chain so you can confirm it matches the key you hold.

Install:

```bash
git clone https://github.com/Bahamutnelson/bleap-recover-cli.git
cd bleap-recover-cli
npm install
# either run directly:
#   npx tsx src/cli.ts <command> [options]
# or install the binary:
#   npm run build && npm link      # then use: bleap-recover <command>
```

The examples below use `bleap-recover`; swap in `npx tsx src/cli.ts` if you didn't `npm link`.

---

## 1. The mental model

Recovery is three stages. The middle one has a mandatory waiting period.

```
(prereqs, usually already done)        TRIGGER            wait           WITHDRAW
  module-deploy / wallet-deploy  ──►  withdraw-start  ──►  ~24h  ──►  withdraw-sign ─► withdraw-submit
     permissionless CREATE2         owner key only      timelock      build+sign      handleOps
```

- **Prerequisites** (`module-deploy`, `wallet-deploy`) only matter if the module or the wallet
  isn't deployed on the target chain yet. In the common case (wallet already exists on the chain
  where your funds are stuck) you **skip straight to `withdraw-start`**.
- **`withdraw-start`** starts the timelock. It must be sent **by the signer key itself**.
- After the timelock elapses, **`withdraw-sign`** builds the withdrawal UserOp and gives you a hash
  to sign; **`withdraw-submit`** turns your signature into the final transaction.
- You recover **one asset per pass** (native, then each token). Repeat stages 3–4 per asset.

---

## 2. Check the situation (read-only)

```bash
bleap-recover status \
  --wallet 0xYourWallet \
  --chain  bsc \
  --id     0xYourRootPermissionId \
  --owner  0xYourSignerAddress \
  --token  0xTokenAddress          # optional: also read one ERC-20 balance
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
  token balance:     2000000000000000000000 (TOKEN, 18 dp)
```

**How to read it:**

- `wallet deployed: true` → you can skip the deploy prerequisites and go to stage 3.
- `signer owner` is read from the chain. **Confirm it equals the address your recovery key derives
  to.** If it doesn't match, you're holding the wrong key — stop.
- `Slow-Withdrawal: triggeredAt=0` → not yet triggered. `timelock=86400s` → a 24-hour wait once you
  do trigger.
- `native balance: 0 wei` → the wallet holds no gas token, so `withdraw-sign` will emit a **gas
  prefund** transaction (see stage 3). A non-zero `token balance` tells you the stuck funds are that
  ERC-20 — note the decimals (`dp`) so you get the amount right.

### Amounts and token decimals

`--amount` (and native amounts) are always in the asset's **smallest unit** — never the "human"
amount you see in a wallet UI. Convert with:

```
amount = human_amount × 10^decimals
```

So you must know the asset's `decimals`. `status --token <addr>` prints it as `dp`; you can also
read the token's `decimals()` on a block explorer.

**The same token can have different decimals on different chains** — this is the most common and
most expensive mistake. USDC is the classic trap:

| Asset | Chain | decimals | `--amount` for 2000 tokens |
|---|---|---|---|
| USDC | Ethereum | 6 | `2000000000` |
| USDC | Polygon | 6 | `2000000000` |
| USDC (Binance-Peg) | BSC | **18** | `2000000000000000000000` |
| USDT | Ethereum | 6 | `2000000000` |
| USDT (Binance-Peg) | BSC | **18** | `2000000000000000000000` |
| DAI | most chains | 18 | `2000000000000000000000` |
| WBTC | Ethereum | 8 | `200000000000` |
| native (ETH / BNB / POL) | — | 18 (wei) | `2000000000000000000000` |

Worked examples for an **18-decimal** token (e.g. Binance-Peg USDC on BSC):

- all 2000 tokens → `2000000000000000000000`
- 1 token → `1000000000000000000`
- 0.5 token → `500000000000000000`

And for a **6-decimal** token (e.g. USDC on Ethereum or Polygon):

- 2000 tokens → `2000000000`
- 1 token → `1000000`

To withdraw the **entire** balance, copy the exact integer `status` reports as `token balance` (or
`native balance`) — it is already in smallest units, so no conversion is needed.

> WARNING: getting decimals wrong is silent and severe — sending an 18-decimals token as if it were
> 6-decimals moves 10¹² times too little (or, the other way, reverts for insufficient balance).
> Always confirm the `dp` shown by `status` before you sign.

---

## 3a. (Only if needed) deploy the prerequisites

Skip this whole section if `status` shows the wallet deployed on your target chain.

Both commands are **permissionless CREATE2 replays** — anyone can send them, and the resulting
contract lands at the same address on every chain.

```bash
# co-signing module (via the deterministic / Nick's Method deployer)
bleap-recover build module-deploy --chain bsc

# the wallet contract itself — replay its original deployWithFactory creation calldata
bleap-recover build wallet-deploy \
  --wallet       0xYourWallet \
  --chain        bsc \
  --source-chain arbitrum \
  --tx-hash      0xTheOriginalDeployTxOnTheSourceChain
# (or pass --creation-data 0x… directly if you already have the calldata)
```

Each prints an unsigned `TxRequest`; send it from any funded account.

---

## 3b. Trigger the Slow-Withdrawal

This starts the timelock and is the **one command that is not permissionless** — the module checks
`msg.sender == signers[wallet][id]`, so it **must be sent by your signer key**.

```bash
bleap-recover build withdraw-start \
  --wallet 0xYourWallet \
  --chain  bsc \
  --id     0xYourRootPermissionId
```

Output (illustrative):

```
── 3a) Start the Slow Withdrawal (trigger) ──
  chainId: 56
  to: 0x61576D9ef23514bfe6F080E22CcFFf473cf11A1A
  value: 0 wei
  data: 0x71a533eb…
  note: MUST be sent by the owner key itself (msg.sender == your signer). Starts the timelock.
```

Send it: in Rabby/MetaMask, create a transaction to the `to` address with `value = 0` and paste the
`data` hex into the raw-data field — **from your signer account**. Then re-run `status` and watch
`remaining=…s` count down to `0`.

---

## 4. After the timelock: build and sign the withdrawal

Run `withdraw-sign` for the asset you want to move. For an ERC-20 add `--token`; omit it for the
native token.

```bash
bleap-recover build withdraw-sign \
  --wallet 0xYourWallet \
  --chain  bsc \
  --token  0xTokenAddress \
  --amount 2000000000000000000000 \
  --to     0xYourDestination \
  --out    userop.json
```

This prints up to three things:

**(a) A gas-prefund transaction — only if the wallet has no native balance.**

```
── 3b-pre) Fund gas prefund (wallet has no native token) ──
  to: 0x0000000071727De22E5E9d8BAf0edAc6f37da032   (EntryPoint)
  value: 65000000000000 wei
  data: 0xb760faf9…                                 (depositTo(wallet))
```

Send this **first**, from any account with the native gas token. It tops up the wallet's EntryPoint
deposit so the UserOp can pay for its own execution.

**What that `value` means.** Native amounts are always in **wei**, the smallest unit of the gas
token (18 decimals, exactly like an 18-decimal ERC-20). To read it as BNB/ETH, move the decimal
point 18 places left:

```
65000000000000 wei  =  0.000065 BNB   (65000000000000 ÷ 10^18)
```

So it's a tiny amount — here about 0.000065 BNB. **You don't compute it** — the tool derives it for
you as the UserOp's worst-case gas cost:

```
value = (verificationGasLimit + callGasLimit + preVerificationGas) × maxFeePerGas
      ≈ (600000 + 500000 + 200000) gas × 0.05 gwei
      = 1,300,000 × 50,000,000 wei
      = 65,000,000,000,000 wei
```

Just send the **exact** `value` printed (a hair more is fine — any unused deposit stays in the
wallet's EntryPoint balance and can be withdrawn later). If the wallet already holds native token,
this prefund step is skipped entirely.

**(b) A hash to sign.**

```
── Sign this hash externally ──
  personal_sign hash: 0x932c4db1…2c06
```

**`personal_sign` this exact 32-byte hash** with your signer key:

- **Rabby:** "Sign Message" → paste the hash as the message (raw), or use a raw `personal_sign`
  flow if your build exposes one.
- **MetaMask:** call `window.ethereum.request({ method: "personal_sign", params: [hash, account] })`
  from a dapp/console, or use any wallet feature that signs a raw hash.

> **Critical:** sign the exact hash printed. Do **not** run it through a UI that re-hashes or
> re-prefixes the string — the signature must be over that precise 32-byte value, or submission will
> revert.

**(c) The UserOp JSON** (also written to `--out userop.json`). Keep it — the next step needs it.

> **Note:** the hash depends on every field, including `--to`. If you change the destination or
> amount, re-run `withdraw-sign` and sign the **new** hash.

---

## 5. Submit

```bash
bleap-recover build withdraw-submit \
  --wallet      0xYourWallet \
  --chain       bsc \
  --userop-json userop.json \
  --signature   0xYourSignature \
  --beneficiary 0xYourDestination
```

`withdraw-submit` re-checks the timelock, wraps your signature in the Kernel signer format, and
prints the final `handleOps` transaction. **Any account with the native gas token can broadcast it**
— it doesn't have to be your signer. The funds move to your chosen destination.

Repeat stages 4–5 for each additional asset.

---

## 6. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `Slow-Withdrawal timelock not elapsed: …s remaining` on submit | The wait isn't over. Check `status`; wait until `remaining=0s`. |
| Submission reverts `AA23` / signer prefix | The signature wasn't produced over the exact printed hash, or was mangled by a re-hashing UI. Re-sign the raw 32-byte hash. `withdraw-submit` adds the required Kernel prefix for you — don't add it yourself. |
| Submission reverts, target rejected | The module refuses a call whose target equals the wallet itself. For native sends, `--to` must not be the wallet; for tokens, the target is the token contract (handled for you). |
| UserOp can't pay gas / `AA21` | The wallet's EntryPoint deposit is empty. Send the `depositTx` from stage 4(a) before submitting. |
| Trigger reverts | `withdraw-start` must be sent **from the signer key** (`msg.sender == signers[wallet][id]`). Sending it from another account fails. |
| Amount looks 10^n off | Amounts are in the asset's smallest unit. Multiply by `10^decimals` (see the `dp` in `status`). |

---

## 7. Security checklist

- [ ] The tool never asked you for a private key. (It never will — `grep -ri "private" src/`.)
- [ ] You confirmed `status`'s `signer owner` matches the address your key controls.
- [ ] You signed only the exact hash `withdraw-sign` printed, in your own wallet.
- [ ] You reviewed each `to` / `value` / `data` before sending it.
- [ ] Your destination address is one you control.

That's it — builder-only, keys never leave your wallet.

#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import type { Address, Hex } from "viem";
import { resolveChain, type ChainInfo } from "./chains.js";
import { makePublicClient } from "./clients.js";
import { getStatus, formatStatus } from "./commands/status.js";
import { buildModuleDeploy } from "./commands/moduleDeploy.js";
import { buildWalletDeploy } from "./commands/walletDeploy.js";
import { buildWithdrawStart } from "./commands/withdrawStart.js";
import { buildWithdrawSign } from "./commands/withdrawSign.js";
import { buildWithdrawSubmit } from "./commands/withdrawSubmit.js";
import { formatTxRequest } from "./txrequest.js";
import type { PackedUserOp } from "./userop.js";

/**
 * `resolveChain` matches its registry by comparing a numeric `c.id` to the key you pass in.
 * A CLI arg is always a string, so "42161" would fail a `===` comparison against the number
 * 42161 and fall through to the synthetic-chain branch (which additionally requires --rpc).
 * Coerce purely-numeric strings to Number before calling resolveChain.
 */
export function coerceChainArg(raw: string): string | number {
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function resolveChainArg(raw: string, rpc?: string): ChainInfo {
  return resolveChain(coerceChainArg(raw), rpc);
}

/**
 * PackedUserOp carries bigint fields (`nonce`, `preVerificationGas`) that JSON.stringify cannot
 * serialize directly. Encode them as decimal strings on the way out and revive them as bigint
 * on the way back in, so withdraw-sign's printed userOp can be round-tripped through a file and
 * fed straight to withdraw-submit's --userop-json.
 */
export function serializeUserOp(userOp: PackedUserOp): string {
  return JSON.stringify(
    {
      ...userOp,
      nonce: userOp.nonce.toString(),
      preVerificationGas: userOp.preVerificationGas.toString(),
    },
    null,
    2,
  );
}

export function parseUserOp(json: string): PackedUserOp {
  const raw = JSON.parse(json);
  return {
    sender: raw.sender as Address,
    nonce: BigInt(raw.nonce),
    initCode: raw.initCode as Hex,
    callData: raw.callData as Hex,
    accountGasLimits: raw.accountGasLimits as Hex,
    preVerificationGas: BigInt(raw.preVerificationGas),
    gasFees: raw.gasFees as Hex,
    paymasterAndData: raw.paymasterAndData as Hex,
    signature: raw.signature as Hex,
  };
}

export function buildProgram(): Command {
  const program = new Command("bleap-recover");
  program
    .description(
      "Builder-only CLI for the Bleap cross-chain fund-recovery flow. It never reads a private key, " +
        "never signs, and never broadcasts — it only prints TxRequests / hashes for you to sign yourself.",
    )
    .version("1.0.0");

  program
    .command("status")
    .description("Read-only snapshot of the recovery state for a wallet")
    .requiredOption("--wallet <address>", "the Bleap wallet address")
    .requiredOption("--chain <idOrName>", "target chain (id or name, e.g. 56 or bsc)")
    .option("--rpc <url>", "override RPC URL for the target chain")
    .option("--id <hex>", "the ROOT permission id (bytes32) to resolve the signer for")
    .option("--owner <address>", "expected signer/owner address (cross-checked against --id)")
    .option("--token <address>", "ERC-20 token address to also report a balance for")
    .action(async (opts) => {
      const chain = resolveChainArg(opts.chain, opts.rpc);
      const client = makePublicClient(chain);
      const report = await getStatus({
        client,
        wallet: opts.wallet as Address,
        id: opts.id as Hex | undefined,
        owner: opts.owner as Address | undefined,
        token: opts.token as Address | undefined,
      });
      console.log(formatStatus(report));
    });

  const build = program.command("build").description("Print an unsigned TxRequest / hash for the next recovery step");

  build
    .command("module-deploy")
    .description("Step 1: deploy the co-signing module via the deterministic deployer (replay, permissionless)")
    .requiredOption("--chain <idOrName>", "target chain (id or name)")
    .option("--rpc <url>", "override RPC URL for the target chain")
    .action(async (opts) => {
      const chain = resolveChainArg(opts.chain, opts.rpc);
      const client = makePublicClient(chain);
      const result = await buildModuleDeploy(client, chain.id);
      if (result.alreadyDeployed) {
        console.log("Module already deployed on this chain — nothing to do.");
        return;
      }
      if (result.deployerMissing) {
        console.log("The deterministic deployer (Nick's factory) is not present on this chain — cannot proceed.");
        return;
      }
      console.log(formatTxRequest(result.tx!, chain.explorer));
    });

  build
    .command("wallet-deploy")
    .description("Step 2: deploy your wallet on the target chain by replaying its creation data (permissionless)")
    .requiredOption("--wallet <address>", "the Bleap wallet address")
    .requiredOption("--chain <idOrName>", "target chain (id or name) where the wallet is missing")
    .option("--rpc <url>", "override RPC URL for the target chain")
    .requiredOption("--source-chain <idOrName>", "a chain where the wallet is already deployed")
    .option("--source-rpc <url>", "override RPC URL for the source chain")
    .option("--tx-hash <hash>", "the original deployWithFactory tx hash on the source chain")
    .option("--creation-data <hex>", "the raw creation calldata, if already known (skips --tx-hash lookup)")
    .action(async (opts) => {
      const chain = resolveChainArg(opts.chain, opts.rpc);
      const sourceChain = resolveChainArg(opts.sourceChain, opts.sourceRpc);
      const targetClient = makePublicClient(chain);
      const sourceClient = makePublicClient(sourceChain);
      const result = await buildWalletDeploy({
        targetClient,
        sourceClient,
        wallet: opts.wallet as Address,
        chainId: chain.id,
        txHash: opts.txHash as Hex | undefined,
        creationData: opts.creationData as Hex | undefined,
      });
      if (result.alreadyDeployed) {
        console.log("Wallet already deployed on this chain — nothing to do.");
        return;
      }
      console.log(formatTxRequest(result.tx!, chain.explorer));
    });

  build
    .command("withdraw-start")
    .description("Step 3a: trigger the Slow Withdrawal timelock (must be sent by the owner key)")
    .requiredOption("--wallet <address>", "the Bleap wallet address")
    .requiredOption("--chain <idOrName>", "target chain (id or name)")
    .requiredOption("--id <hex>", "the ROOT permission id (bytes32)")
    .action(async (opts) => {
      const chain = resolveChainArg(opts.chain);
      const tx = buildWithdrawStart({ chainId: chain.id, wallet: opts.wallet as Address, id: opts.id as Hex });
      console.log(formatTxRequest(tx, chain.explorer));
    });

  build
    .command("withdraw-sign")
    .description("Step 3b: build the unsigned UserOp + hash for you to personal_sign externally")
    .requiredOption("--wallet <address>", "the Bleap wallet address")
    .requiredOption("--chain <idOrName>", "target chain (id or name)")
    .option("--rpc <url>", "override RPC URL for the target chain")
    .requiredOption("--to <address>", "withdrawal destination address")
    .option("--token <address>", "ERC-20 token to withdraw (omit for native)")
    .requiredOption("--amount <wei>", "amount to withdraw, in the token's smallest unit / wei")
    .option("--out <file>", "also write the userOp JSON to this file")
    .action(async (opts) => {
      const chain = resolveChainArg(opts.chain, opts.rpc);
      const client = makePublicClient(chain);
      const result = await buildWithdrawSign({
        client,
        chainId: chain.id,
        wallet: opts.wallet as Address,
        to: opts.to as Address,
        token: opts.token as Address | undefined,
        amount: BigInt(opts.amount),
      });
      if (result.depositTx) {
        console.log(formatTxRequest(result.depositTx, chain.explorer));
        console.log("");
      }
      console.log(`── Sign this hash externally ──`);
      console.log(`  personal_sign hash: ${result.personalSignMessage}`);
      console.log(
        "  → In your own wallet (Rabby/MetaMask 'Sign Message' or a raw personal_sign call), sign EXACTLY " +
          "this hash. The tool never sees your key and never signs on your behalf.",
      );
      console.log(
        "  → Then run: bleap-recover build withdraw-submit --signature <sig> --userop-json <file> " +
          "(see userOp JSON below / --out).",
      );
      const userOpJson = serializeUserOp(result.userOp);
      console.log("");
      console.log("── userOp (JSON, keep for withdraw-submit) ──");
      console.log(userOpJson);
      if (opts.out) {
        writeFileSync(opts.out, userOpJson);
        console.log(`  (written to ${opts.out})`);
      }
    });

  build
    .command("withdraw-submit")
    .description("Step 3c: build the handleOps TxRequest that completes the withdrawal (after the timelock elapses)")
    .requiredOption("--wallet <address>", "the Bleap wallet address")
    .requiredOption("--chain <idOrName>", "target chain (id or name)")
    .option("--rpc <url>", "override RPC URL for the target chain")
    .requiredOption("--userop-json <file>", "path to the userOp JSON printed/saved by withdraw-sign")
    .requiredOption("--signature <hex>", "the signature produced by personal_sign on the withdraw-sign hash")
    .requiredOption("--beneficiary <address>", "address to receive the EntryPoint gas refund")
    .action(async (opts) => {
      const chain = resolveChainArg(opts.chain, opts.rpc);
      const client = makePublicClient(chain);
      const userOp = parseUserOp(readFileSync(opts.useropJson, "utf8"));
      const tx = await buildWithdrawSubmit({
        client,
        chainId: chain.id,
        wallet: opts.wallet as Address,
        userOp,
        signature: opts.signature as Hex,
        beneficiary: opts.beneficiary as Address,
      });
      console.log(formatTxRequest(tx, chain.explorer));
    });

  return program;
}

export async function main(): Promise<void> {
  await buildProgram().parseAsync(process.argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}

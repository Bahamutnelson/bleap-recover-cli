import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Instance, Server } from "prool";
import {
  createPublicClient, createWalletClient, createTestClient, http, publicActions, walletActions,
  encodeAbiParameters, parseAbiParameters, concat, getContractAddress,
  type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { buildModuleDeploy } from "../../src/commands/moduleDeploy.js";
import { buildWalletDeploy } from "../../src/commands/walletDeploy.js";
import { buildWithdrawStart } from "../../src/commands/withdrawStart.js";
import { buildWithdrawSign } from "../../src/commands/withdrawSign.js";
import { buildWithdrawSubmit } from "../../src/commands/withdrawSubmit.js";
import { parseWalletCreationData, derivePermissionId } from "../../src/kernelConfig.js";
import { COSIGNING_MODULE } from "../../src/constants.js";
import { cosigningModuleAbi, erc20Abi } from "../../src/abi.js";
import {
  buildModuleDeployWithFactoryCalldata, BLEAP_KERNEL_FACTORY, kernelFactoryAbi,
} from "../support/moduleWallet.js";
import { MOCK_ERC20_BYTECODE } from "../support/mockErc20.js";

// Full builder-only Slow-Withdrawal recovery, exercised end-to-end against a fresh Ethereum fork.
// Route A (see report): we construct a PERMISSION-archetype wallet whose root permission's signer is
// the real CosigningModuleV1, installed with a THROWAWAY owner key we control (fork-only). Every step
// goes through the real builders — this test's purpose is to validate THEM, not to reimplement them.
//
// Builder-only invariant: the tool never signs/sends. Here the TEST plays "the owner in their own
// wallet": it signs with the throwaway key and broadcasts the builders' TxRequests via a test client.

const OWNER_PK: Hex = "0xac0313a4f9b90fa5fb28f96c4bb8f95b16e4ba5eec1b41c2a1e93d33e21b3f6e"; // arbitrary fork-only test key (never a real key)
const CHAIN_ID = 1;
const DEST: Address = "0x00000000000000000000000000000000DeaDBeef";

let rpcUrl: string;
let server: ReturnType<typeof Server.create>;
const owner = privateKeyToAccount(OWNER_PK);

let pub: ReturnType<typeof createPublicClient>;
let test: any;
let walletClient: ReturnType<typeof createWalletClient>;

async function send(tx: { to: Address; data: Hex; value: bigint }) {
  const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: tx.value, account: owner, chain: mainnet });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return r;
}

// Deploy module (if needed), construct + deploy a fresh module-permission wallet, return its address & id.
async function reconstructWallet(permissionId: Hex): Promise<{ wallet: Address; id: Hex; creationData: Hex }> {
  const md = await buildModuleDeploy(pub as any, CHAIN_ID);
  if (md.tx) await send(md.tx);

  const built = buildModuleDeployWithFactoryCalldata(owner.address, permissionId);
  const wallet = await pub.readContract({
    address: BLEAP_KERNEL_FACTORY, abi: kernelFactoryAbi, functionName: "getAddress",
    args: [built.createData, built.salt],
  });
  const wd = await buildWalletDeploy({
    targetClient: pub as any, sourceClient: pub as any, wallet, chainId: CHAIN_ID, creationData: built.calldata,
  });
  if (wd.tx) await send(wd.tx);

  // The tool re-derives owner + id purely from the creation data.
  const cfg = parseWalletCreationData(built.calldata);
  expect(cfg.owner?.toLowerCase()).toBe(owner.address.toLowerCase());
  const id = derivePermissionId(built.calldata);
  return { wallet, id, creationData: built.calldata };
}

async function triggerAndWait(wallet: Address, id: Hex) {
  await send(buildWithdrawStart({ chainId: CHAIN_ID, wallet, id }));
  const triggeredAt = await pub.readContract({
    address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "triggeredSlowWithdrawals", args: [wallet],
  });
  expect(triggeredAt).toBeGreaterThan(0n);
  await test.setNextBlockTimestamp({ timestamp: triggeredAt + 86_401n }); // default 24h timelock + 1s
  await test.mine({ blocks: 1 });
}

beforeAll(async () => {
  server = Server.create({ instance: Instance.anvil({ forkUrl: process.env.ETH_FORK_RPC! }), port: 8548 });
  await server.start();
  rpcUrl = "http://localhost:8548/1";
  pub = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
  test = createTestClient({ mode: "anvil", chain: mainnet, transport: http(rpcUrl) }).extend(publicActions).extend(walletActions);
  walletClient = createWalletClient({ account: owner, chain: mainnet, transport: http(rpcUrl) });
  await test.setBalance({ address: owner.address, value: 10n ** 20n }); // gas for the owner EOA
}, 120_000);

afterAll(async () => { await server.stop(); });

describe("Slow-Withdrawal recovery E2E (Ethereum fork)", () => {
  it("recovers native ETH: build → deploy → trigger → wait → sign → submit → funds move", async () => {
    const { wallet, id } = await reconstructWallet("0xcafebabe");

    // On-chain proof the permission installed our owner as the signer.
    const signer = await pub.readContract({
      address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "signers", args: [wallet, id],
    });
    expect(signer.toLowerCase()).toBe(owner.address.toLowerCase());

    const seed = 5n * 10n ** 18n;
    const amount = 1n * 10n ** 18n;
    await test.setBalance({ address: wallet, value: seed }); // native to sweep (also pays its own gas)

    await triggerAndWait(wallet, id);

    const sign = await buildWithdrawSign({ client: pub as any, chainId: CHAIN_ID, wallet, to: DEST, amount });
    if (sign.depositTx) await send(sign.depositTx);
    const signature = await owner.signMessage({ message: { raw: sign.userOpHash } });

    const destBefore = await pub.getBalance({ address: DEST });
    const walletBefore = await pub.getBalance({ address: wallet });
    const submit = await buildWithdrawSubmit({
      client: pub as any, chainId: CHAIN_ID, wallet, userOp: sign.userOp, signature, beneficiary: owner.address,
    });
    await send(submit);

    const destAfter = await pub.getBalance({ address: DEST });
    const walletAfter = await pub.getBalance({ address: wallet });
    expect(destAfter - destBefore).toBe(amount);
    expect(walletAfter).toBeLessThan(walletBefore); // dropped by amount + gas
  }, 120_000);

  it("recovers an ERC-20 (wallet has no native → depositTx path funds gas, then token moves)", async () => {
    const { wallet, id } = await reconstructWallet("0x11223344"); // different permissionId → different wallet

    // Deploy a mock ERC-20 minting the whole supply straight into the wallet.
    const tokenSupply = 1_000n * 10n ** 18n;
    const deployData = concat([
      MOCK_ERC20_BYTECODE,
      encodeAbiParameters(parseAbiParameters("address, uint256"), [wallet, tokenSupply]),
    ]);
    const deployNonce = await pub.getTransactionCount({ address: owner.address });
    const token = getContractAddress({ from: owner.address, nonce: BigInt(deployNonce) });
    await send({ to: undefined as any, data: deployData, value: 0n } as any);
    const walletTokenBefore = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
    expect(walletTokenBefore).toBe(tokenSupply);

    // Wallet holds NO native → buildWithdrawSign must emit a depositTx to prefund gas.
    expect(await pub.getBalance({ address: wallet })).toBe(0n);

    await triggerAndWait(wallet, id);

    const amount = 250n * 10n ** 18n;
    const sign = await buildWithdrawSign({ client: pub as any, chainId: CHAIN_ID, wallet, to: DEST, token, amount });
    expect(sign.depositTx, "depositTx expected when the wallet has no native balance").toBeDefined();
    if (sign.depositTx) await send(sign.depositTx);
    const signature = await owner.signMessage({ message: { raw: sign.userOpHash } });

    const destTokenBefore = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [DEST] });
    const submit = await buildWithdrawSubmit({
      client: pub as any, chainId: CHAIN_ID, wallet, userOp: sign.userOp, signature, beneficiary: owner.address,
    });
    await send(submit);

    const destTokenAfter = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [DEST] });
    const walletTokenAfter = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
    expect(destTokenAfter - destTokenBefore).toBe(amount);
    expect(walletTokenAfter).toBe(tokenSupply - amount);
  }, 120_000);
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Instance, Server } from "prool";
import {
  createPublicClient, createWalletClient, createTestClient, http, publicActions,
  pad, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { parseWalletCreationData, derivePermissionId } from "../../src/kernelConfig.js";
import { buildModuleDeploy } from "../../src/commands/moduleDeploy.js";
import { buildWalletDeploy } from "../../src/commands/walletDeploy.js";
import { COSIGNING_MODULE } from "../../src/constants.js";
import { cosigningModuleAbi } from "../../src/abi.js";
import {
  buildModuleDeployWithFactoryCalldata, BLEAP_KERNEL_FACTORY, kernelFactoryAbi,
} from "../support/moduleWallet.js";

// ── Honesty note ──────────────────────────────────────────────────────────────────────────────
// The VALIDATOR branch is asserted against REAL on-chain data: the exact 452-byte deployWithFactory
// input of a real Bleap passkey wallet deploy on Arbitrum (tx 0xb76fe2bf…6ec9, wallet 0x6723…D22f).
// No real Bleap module-archetype (slow-withdrawal) creation tx was on hand, so the PERMISSION branch
// is validated against creation data we CONSTRUCT and then prove the chain accepts: we deploy it via
// the real FactoryStaker + Bleap KernelFactory on an Ethereum fork and read back
// signers[wallet][id] == owner from the on-chain CosigningModule. Parsing is then checked to agree
// with that chain-accepted reality.

// Real passkey deployWithFactory input (VALIDATOR archetype, WebAuthnValidator root).
const REAL_PASSKEY_DEPLOY_WITH_FACTORY: Hex =
  "0xc5265d5d0000000000000000000000006723b44abeec4e71ebe3232bd5b455805badd22f0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000540510504a20d976000000000000000000000000000000000000000000000000000000000000012412af322c017ab16ff354acb328452f1d445b3ddee9a91e9e69000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000603919eeedf7e0df08416e27a6796e9bc1ec8f7ff43c0bfac88e66b17222e3b3e88ddd975ff44102352116bcd116b87057d3e1f0e9b4abdaf5ed8b39ed1519011c1bc83a312c3da9380ec52df4cb50d28a4e88b8641238c47c6c5e60c1095c9515000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const WEBAUTHN_VALIDATOR = "0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69";

// An arbitrary fork-only test key (never a real key).
const OWNER_PK: Hex = "0xac0313a4f9b90fa5fb28f96c4bb8f95b16e4ba5eec1b41c2a1e93d33e21b3f6e";
const PERMISSION_ID: Hex = "0xcafebabe";

describe("parseWalletCreationData — VALIDATOR branch (real passkey data)", () => {
  it("recognizes the passkey wallet as a plain validator archetype", () => {
    const cfg = parseWalletCreationData(REAL_PASSKEY_DEPLOY_WITH_FACTORY);
    expect(cfg.archetype).toBe("validator");
    expect(cfg.rootValidatorId.toLowerCase()).toBe(WEBAUTHN_VALIDATOR.toLowerCase());
    expect(cfg.permissionId).toBeNull();
    expect(cfg.signerModule).toBeNull();
    expect(cfg.owner).toBeNull();
  });

  it("derivePermissionId throws for the validator archetype (no slow-withdrawal path)", () => {
    expect(() => derivePermissionId(REAL_PASSKEY_DEPLOY_WITH_FACTORY)).toThrow(/validator archetype/i);
  });
});

describe("parseWalletCreationData — PERMISSION branch (constructed & chain-accepted)", () => {
  let rpcUrl: string;
  let server: ReturnType<typeof Server.create>;
  const owner = privateKeyToAccount(OWNER_PK);
  const built = buildModuleDeployWithFactoryCalldata(owner.address, PERMISSION_ID);
  let wallet: Address;

  beforeAll(async () => {
    server = Server.create({ instance: Instance.anvil({ forkUrl: process.env.ETH_FORK_RPC! }), port: 8547 });
    await server.start();
    rpcUrl = "http://localhost:8547/1";

    const pub = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
    const test = createTestClient({ mode: "anvil", chain: mainnet, transport: http(rpcUrl) })
      .extend(publicActions);
    const walletClient = createWalletClient({ account: owner, chain: mainnet, transport: http(rpcUrl) });
    await test.setBalance({ address: owner.address, value: 10n ** 20n });
    const send = async (tx: { to: Address; data: Hex; value: bigint }) => {
      const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
    };

    const md = await buildModuleDeploy(pub as any, 1);
    if (md.tx) await send(md.tx);

    wallet = await pub.readContract({
      address: BLEAP_KERNEL_FACTORY, abi: kernelFactoryAbi, functionName: "getAddress",
      args: [built.createData, built.salt],
    });
    const wd = await buildWalletDeploy({
      targetClient: pub as any, sourceClient: pub as any, wallet, chainId: 1, creationData: built.calldata,
    });
    if (wd.tx) await send(wd.tx);

    // Prove the chain accepted the permission encoding: the module stores our owner as the signer.
    const onChainSigner = await pub.readContract({
      address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "signers",
      args: [wallet, pad(PERMISSION_ID, { dir: "right", size: 32 })],
    });
    expect(onChainSigner.toLowerCase()).toBe(owner.address.toLowerCase());
  }, 120_000);

  afterAll(async () => { await server.stop(); });

  it("parses the constructed creation data as a permission-module archetype", () => {
    const cfg = parseWalletCreationData(built.calldata);
    expect(cfg.archetype).toBe("permission-module");
    expect(cfg.signerModule).toBe(COSIGNING_MODULE);
    expect(cfg.owner?.toLowerCase()).toBe(owner.address.toLowerCase());
    expect(cfg.permissionId).toBe(PERMISSION_ID);
    expect(cfg.permissionId && cfg.permissionId.length).toBe(2 + 8); // "0x" + 4 bytes
  });

  it("derivePermissionId left-aligns the 4-byte permissionId to bytes32", () => {
    expect(derivePermissionId(built.calldata)).toBe(pad(PERMISSION_ID, { dir: "right", size: 32 }));
  });

  it("agrees with the raw inner createData too (envelope-agnostic)", () => {
    const cfgFromInner = parseWalletCreationData(built.createData);
    expect(cfgFromInner.archetype).toBe("permission-module");
    expect(cfgFromInner.owner?.toLowerCase()).toBe(owner.address.toLowerCase());
  });
});

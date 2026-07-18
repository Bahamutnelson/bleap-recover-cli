import { describe, it, expect } from "vitest";
import { buildWalletDeploy } from "../../src/commands/walletDeploy.js";
import { WALLET_FACTORY } from "../../src/constants.js";
import { makePublicClient } from "../../src/clients.js";

const TX = process.env.BLEAP_TEST_WALLET_TX as `0x${string}`; // creation tx on Arbitrum
const WALLET = process.env.BLEAP_TEST_WALLET as `0x${string}`;
const source = makePublicClient({ id: 42161, name: "arbitrum", rpcUrl: process.env.ARB_FORK_RPC ?? "https://arb1.arbitrum.io/rpc", explorer: "" });
// target = a fresh Ethereum fork where the wallet is NOT deployed
const target = makePublicClient({ id: 1, name: "ethereum", rpcUrl: process.env.ETH_FORK_RPC!, explorer: "" });

describe("buildWalletDeploy", () => {
  it("fetches creation data from the source tx and targets the factory", async () => {
    const r = await buildWalletDeploy({ targetClient: target, sourceClient: source, wallet: WALLET, chainId: 1, txHash: TX });
    expect(r.tx?.to).toBe(WALLET_FACTORY);
    expect(r.tx?.value).toBe(0n);
    expect(r.creationData.length).toBeGreaterThan(10);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Instance, Server } from "prool";
import { getStatus, formatStatus } from "../../src/commands/status.js";
import { makePublicClient } from "../../src/clients.js";

const WALLET = process.env.BLEAP_TEST_WALLET as `0x${string}`;
const ID = process.env.BLEAP_TEST_PERMISSION_ID as `0x${string}`;
const ARB_RPC = process.env.ARB_FORK_RPC ?? "https://arb1.arbitrum.io/rpc";

let rpcUrl: string;
let server: ReturnType<typeof Server.create>;

beforeAll(async () => {
  server = Server.create({ instance: Instance.anvil({ forkUrl: ARB_RPC }), port: 8549 });
  await server.start();
  rpcUrl = "http://localhost:8549/1";
});
afterAll(async () => { await server.stop(); });

describe("status on Arbitrum fork", () => {
  it("reports module + wallet deployed and a resolvable signer", async () => {
    const client = makePublicClient({ id: 42161, name: "arbitrum", rpcUrl, explorer: "" });
    const r = await getStatus({ client, wallet: WALLET, id: ID });
    expect(r.moduleDeployed).toBe(true);
    expect(r.walletDeployed).toBe(true);
    expect(r.signerOwner).not.toBeNull();
    expect(formatStatus(r)).toContain("Slow-Withdrawal");
  });
});

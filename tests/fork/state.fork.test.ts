import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Instance, Server } from "prool";
import { makePublicClient } from "../../src/clients.js";
import {
  moduleDeployed,
  deployerPresent,
  slowWithdrawStatus,
  isContractDeployed,
  discoverSignerId,
} from "../../src/state.js";
import { COSIGNING_MODULE } from "../../src/constants.js";

// A real Bleap wallet address on Arbitrum for read-only assertions.
const KNOWN_WALLET = process.env.BLEAP_TEST_WALLET as `0x${string}`; // set in .env.test
const KNOWN_PERMISSION_ID = process.env.BLEAP_TEST_PERMISSION_ID as `0x${string}`;
const KNOWN_OWNER = process.env.BLEAP_TEST_OWNER as `0x${string}`;
const ARB_RPC = process.env.ARB_FORK_RPC ?? "https://arb1.arbitrum.io/rpc";

let rpcUrl: string;
let server: ReturnType<typeof Server.create>;

beforeAll(async () => {
  server = Server.create({ instance: Instance.anvil({ forkUrl: ARB_RPC }), port: 8545 });
  await server.start();
  rpcUrl = "http://localhost:8545/1";
});

afterAll(async () => {
  await server.stop();
});

describe("state probes on an Arbitrum fork", () => {
  it("sees the co-signing module and deployer deployed", async () => {
    const client = makePublicClient({ id: 42161, name: "arbitrum", rpcUrl, explorer: "" });
    expect(await moduleDeployed(client)).toBe(true);
    expect(await deployerPresent(client)).toBe(true);
    expect(await isContractDeployed(client, COSIGNING_MODULE)).toBe(true);
  });

  it("reads slow-withdraw status for a known wallet without throwing", async () => {
    const client = makePublicClient({ id: 42161, name: "arbitrum", rpcUrl, explorer: "" });
    const s = await slowWithdrawStatus(client, KNOWN_WALLET);
    expect(s.timelockSec).toBeGreaterThan(0n);
    expect(s.timelockSec).toBe(86_400n);
    expect(s.triggeredAt).toBe(0n);
  });

  it("discovers the known signer id and owner for the known wallet", async () => {
    const client = makePublicClient({ id: 42161, name: "arbitrum", rpcUrl, explorer: "" });
    const result = await discoverSignerId(client, KNOWN_WALLET, KNOWN_PERMISSION_ID, KNOWN_OWNER);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(KNOWN_PERMISSION_ID);
    expect(result?.owner.toLowerCase()).toBe(KNOWN_OWNER.toLowerCase());
  });
});

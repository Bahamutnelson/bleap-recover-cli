import { describe, it, expect } from "vitest";
import { makePublicClient } from "../src/clients.js";
import { cosigningModuleAbi, entryPointV07Abi } from "../src/abi.js";

describe("makePublicClient", () => {
  it("builds a client whose chain id matches", () => {
    const client = makePublicClient({ id: 1, name: "ethereum", rpcUrl: "https://eth.llamarpc.com", explorer: "" });
    expect(client.chain?.id).toBe(1);
  });
});
describe("abis", () => {
  it("exposes the functions the tool calls", () => {
    const names = (abi: readonly any[]) => abi.filter((x) => x.type === "function").map((x) => x.name);
    expect(names(cosigningModuleAbi)).toEqual(
      expect.arrayContaining(["triggerSlowWithdraw", "remainingSlowWithdrawTime", "triggeredSlowWithdrawals", "signers", "timelockForSlowWithdraw"]),
    );
    expect(names(entryPointV07Abi)).toEqual(expect.arrayContaining(["getNonce", "getUserOpHash", "handleOps", "depositTo"]));
  });
});

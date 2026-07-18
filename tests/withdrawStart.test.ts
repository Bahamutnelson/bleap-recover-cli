import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { buildWithdrawStart } from "../src/commands/withdrawStart.js";
import { cosigningModuleAbi } from "../src/abi.js";
import { COSIGNING_MODULE } from "../src/constants.js";

describe("buildWithdrawStart", () => {
  it("encodes triggerSlowWithdraw(id, wallet) to the module", () => {
    const id = ("0x" + "ab".repeat(32)) as `0x${string}`;
    const wallet = "0x1111111111111111111111111111111111111111" as const;
    const tx = buildWithdrawStart({ chainId: 1, wallet, id });
    expect(tx.to).toBe(COSIGNING_MODULE);
    expect(tx.value).toBe(0n);
    const dec = decodeFunctionData({ abi: cosigningModuleAbi, data: tx.data });
    expect(dec.functionName).toBe("triggerSlowWithdraw");
    expect(dec.args).toEqual([id, wallet]);
    expect(tx.note).toMatch(/owner key/i);
  });
});

import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData } from "viem";
import { buildWithdrawSubmit } from "../src/commands/withdrawSubmit.js";
import { entryPointV07Abi } from "../src/abi.js";
import { ENTRYPOINT_V07 } from "../src/constants.js";

const okStatusClient = {
  readContract: vi.fn(async ({ functionName }: any) => {
    if (functionName === "triggeredSlowWithdrawals") return 100n;
    if (functionName === "timelockForSlowWithdraw") return 86_400n;
    if (functionName === "remainingSlowWithdrawTime") return 0n; // elapsed
    return 0n;
  }),
} as any;

const userOp = {
  sender: "0x1111111111111111111111111111111111111111", nonce: 0n, initCode: "0x",
  callData: "0x", accountGasLimits: ("0x" + "00".repeat(32)), preVerificationGas: 0n,
  gasFees: ("0x" + "00".repeat(32)), paymasterAndData: "0x", signature: "0x",
} as any;

describe("buildWithdrawSubmit", () => {
  it("encodes handleOps once the timelock has elapsed", async () => {
    const sig = ("0x" + "11".repeat(65)) as `0x${string}`;
    const tx = await buildWithdrawSubmit({
      client: okStatusClient, chainId: 1, wallet: userOp.sender, userOp, signature: sig,
      beneficiary: userOp.sender,
    });
    expect(tx.to).toBe(ENTRYPOINT_V07);
    const dec = decodeFunctionData({ abi: entryPointV07Abi, data: tx.data });
    expect(dec.functionName).toBe("handleOps");
  });
  it("refuses to submit while the timelock is pending", async () => {
    const pending = { readContract: vi.fn(async ({ functionName }: any) =>
      functionName === "remainingSlowWithdrawTime" ? 3600n :
      functionName === "triggeredSlowWithdrawals" ? 100n : 86_400n) } as any;
    await expect(buildWithdrawSubmit({
      client: pending, chainId: 1, wallet: userOp.sender, userOp, signature: ("0x" + "11".repeat(65)) as any,
      beneficiary: userOp.sender,
    })).rejects.toThrow(/timelock/i);
  });
});

import { describe, it, expect } from "vitest";
import { encodeExecuteCallData } from "../src/userop.js";
import { decodeFunctionData, slice } from "viem";
import { kernelExecuteAbi } from "../src/abi.js";

describe("encodeExecuteCallData", () => {
  it("wraps a single-call execution (native sweep) for Kernel.execute", () => {
    const to = "0x2222222222222222222222222222222222222222" as const;
    const data = encodeExecuteCallData(to, 1000n, "0x");
    const dec = decodeFunctionData({ abi: kernelExecuteAbi, data });
    expect(dec.functionName).toBe("execute");
    // execMode high byte = CALLTYPE_SINGLE (0x00)
    const execMode = dec.args[0] as `0x${string}`;
    expect(slice(execMode, 0, 1)).toBe("0x00");
    // executionCalldata begins with the 20-byte target
    const execCalldata = dec.args[1] as `0x${string}`;
    expect(slice(execCalldata, 0, 20).toLowerCase()).toBe(to.toLowerCase());
  });
});

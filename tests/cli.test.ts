import { describe, it, expect } from "vitest";
import { buildProgram, coerceChainArg, coercePermissionId, serializeUserOp, parseUserOp } from "../src/cli.js";
import { resolveChain } from "../src/chains.js";
import type { PackedUserOp } from "../src/userop.js";

describe("cli", () => {
  it("exposes the documented commands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(["status", "build"]));
    const build = program.commands.find((c) => c.name() === "build")!;
    expect(build.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["module-deploy", "wallet-deploy", "withdraw-start", "withdraw-sign", "withdraw-submit"]),
    );
  });

  it("coerces a numeric --chain argument so resolveChain matches the registry", () => {
    expect(coerceChainArg("42161")).toBe(42161);
    expect(coerceChainArg("arbitrum")).toBe("arbitrum");
    const info = resolveChain(coerceChainArg("42161"));
    expect(info.name).toBe("arbitrum");
    expect(info.id).toBe(42161);
  });

  it("round-trips a PackedUserOp through JSON including its bigint fields", () => {
    const userOp: PackedUserOp = {
      sender: "0x1111111111111111111111111111111111111111",
      nonce: 123456789012345678901234567890n,
      initCode: "0x",
      callData: "0xdeadbeef",
      accountGasLimits: `0x${"00".repeat(32)}`,
      preVerificationGas: 987654321098765432109876543210n,
      gasFees: `0x${"11".repeat(32)}`,
      paymasterAndData: "0x",
      signature: `0x${"00".repeat(65)}`,
    };
    const json = serializeUserOp(userOp);
    expect(() => JSON.stringify(JSON.parse(json))).not.toThrow();
    const back = parseUserOp(json);
    expect(back.nonce).toBe(userOp.nonce);
    expect(back.preVerificationGas).toBe(userOp.preVerificationGas);
    expect(back).toEqual(userOp);
  });

  it("coerces a 4-byte --id to the right-padded bytes32 module key", () => {
    expect(coercePermissionId("0xd7399586")).toBe(
      "0xd739958600000000000000000000000000000000000000000000000000000000",
    );
  });

  it("passes a full bytes32 --id through unchanged", () => {
    const full = "0xd739958600000000000000000000000000000000000000000000000000000000";
    expect(coercePermissionId(full)).toBe(full);
  });

  it("rejects an --id that is neither 4 nor 32 bytes with a clear message", () => {
    expect(() => coercePermissionId("0xd73995")).toThrow(/4 bytes.*or.*32 bytes|permission id/i);
    expect(() => coercePermissionId("d7399586")).toThrow(/permission id/i);
    expect(() => coercePermissionId("0xzz399586")).toThrow(/permission id/i);
  });
});

import { describe, it, expect } from "vitest";
import { encodeKernelNonce, nonceKeyFor } from "../src/nonce.js";

describe("encodeKernelNonce", () => {
  it("packs a ROOT nonce with only a sequence number", () => {
    // mode=0, vType=0, identifier=0, key=0, seq=5 -> just 5
    expect(encodeKernelNonce({ seq: 5n })).toBe(5n);
  });
  it("places vType in byte 30", () => {
    // vType=1 -> 1 << (30*8)
    expect(encodeKernelNonce({ vType: 0x01, seq: 0n })).toBe(1n << 240n);
  });
  it("derives the 192-bit key as nonce >> 64 for a validator identifier", () => {
    const id = "0x1111111111111111111111111111111111111111" as const;
    const full = encodeKernelNonce({ vType: 0x01, identifier: id, nonceKey: 0, seq: 0n });
    expect(nonceKeyFor(0x01, id, 0)).toBe(full >> 64n);
  });
});

import { describe, it, expect } from "vitest";
import { formatTxRequest } from "../src/txrequest.js";

describe("formatTxRequest", () => {
  it("renders the core fields", () => {
    const out = formatTxRequest({
      chainId: 1, to: "0x0000000000000000000000000000000000000001",
      data: "0xdeadbeef", value: 0n, label: "test-tx",
    });
    expect(out).toContain("test-tx");
    expect(out).toContain("chainId: 1");
    expect(out).toContain("0x0000000000000000000000000000000000000001");
    expect(out).toContain("0xdeadbeef");
    expect(out).toContain("value: 0");
  });
});

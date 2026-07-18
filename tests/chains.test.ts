import { describe, it, expect } from "vitest";
import { resolveChain } from "../src/chains.js";

describe("resolveChain", () => {
  it("resolves a known chain by name", () => {
    const c = resolveChain("arbitrum");
    expect(c.id).toBe(42161);
    expect(c.rpcUrl).toMatch(/^https?:\/\//);
  });
  it("resolves a known chain by numeric id", () => {
    expect(resolveChain(1).name).toBe("ethereum");
  });
  it("applies an rpc override", () => {
    expect(resolveChain(1, "https://x.example").rpcUrl).toBe("https://x.example");
  });
  it("accepts an unknown id only with an rpc override", () => {
    expect(resolveChain(9999, "https://x.example").name).toBe("chain-9999");
    expect(() => resolveChain(9999)).toThrow(/Unknown chain/);
  });
});

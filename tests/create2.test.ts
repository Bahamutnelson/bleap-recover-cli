import { describe, it, expect } from "vitest";
import { computeCreate2Address, verifyModuleCreation, MODULE_CREATION } from "../src/create2.js";
import { COSIGNING_MODULE, DETERMINISTIC_DEPLOYER } from "../src/constants.js";
import { size } from "viem";

describe("create2", () => {
  it("splits the fixture calldata into 32-byte salt + initcode", () => {
    expect(size(MODULE_CREATION.salt)).toBe(32);
    expect(MODULE_CREATION.calldata).toBe((MODULE_CREATION.salt + MODULE_CREATION.initCode.slice(2)) as `0x${string}`);
  });
  it("reproduces the co-signing module address from its creation fixture", () => {
    const addr = computeCreate2Address(DETERMINISTIC_DEPLOYER, MODULE_CREATION.salt, MODULE_CREATION.initCode);
    expect(addr).toBe(COSIGNING_MODULE);
  });
  it("verifyModuleCreation returns the module address", () => {
    expect(verifyModuleCreation()).toBe(COSIGNING_MODULE);
  });
});

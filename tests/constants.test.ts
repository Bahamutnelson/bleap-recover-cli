import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import {
  COSIGNING_MODULE, WALLET_FACTORY,
  ENTRYPOINT_V07, DETERMINISTIC_DEPLOYER, DEFAULT_TIMELOCK_SEC, MAX_TIMELOCK_SEC,
} from "../src/constants.js";

describe("reference constants", () => {
  it("are all valid checksummed addresses matching the Bleap guide", () => {
    expect(COSIGNING_MODULE).toBe(getAddress("0x61576D9ef23514bfe6F080E22CcFFf473cf11A1A"));
    expect(WALLET_FACTORY).toBe(getAddress("0xd703aaE79538628d27099B8c4f621bE4CCd142d5"));
    expect(ENTRYPOINT_V07).toBe(getAddress("0x0000000071727De22E5E9d8BAf0edAc6f37da032"));
    expect(DETERMINISTIC_DEPLOYER).toBe(getAddress("0x4e59b44847b379578588920cA78FbF26c0B4956C"));
  });
  it("has the module's documented timelock bounds", () => {
    expect(DEFAULT_TIMELOCK_SEC).toBe(86_400n);
    expect(MAX_TIMELOCK_SEC).toBe(259_200n);
  });
});

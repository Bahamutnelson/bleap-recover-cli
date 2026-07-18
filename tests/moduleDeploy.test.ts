import { describe, it, expect } from "vitest";
import { buildModuleDeploy } from "../src/commands/moduleDeploy.js";
import { DETERMINISTIC_DEPLOYER } from "../src/constants.js";
import { MODULE_CREATION } from "../src/create2.js";

const fakeClient = (code: Record<string, string>) => ({
  getCode: async ({ address }: { address: string }) => code[address.toLowerCase()] ?? "0x",
}) as any;

describe("buildModuleDeploy", () => {
  it("returns the deployer tx when module absent but deployer present", async () => {
    const client = fakeClient({ [DETERMINISTIC_DEPLOYER.toLowerCase()]: "0x60" });
    const r = await buildModuleDeploy(client, 1);
    expect(r.alreadyDeployed).toBe(false);
    expect(r.tx?.to).toBe(DETERMINISTIC_DEPLOYER);
    expect(r.tx?.data).toBe(MODULE_CREATION.calldata);
    expect(r.tx?.value).toBe(0n);
  });
  it("reports alreadyDeployed when module code exists", async () => {
    const { COSIGNING_MODULE } = await import("../src/constants.js");
    const client = fakeClient({ [COSIGNING_MODULE.toLowerCase()]: "0x60", [DETERMINISTIC_DEPLOYER.toLowerCase()]: "0x60" });
    expect((await buildModuleDeploy(client, 1)).alreadyDeployed).toBe(true);
  });
  it("flags a missing deterministic deployer", async () => {
    const client = fakeClient({});
    expect((await buildModuleDeploy(client, 1)).deployerMissing).toBe(true);
  });
});

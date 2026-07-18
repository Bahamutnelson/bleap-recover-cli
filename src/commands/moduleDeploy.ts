import type { PublicClient } from "viem";
import { DETERMINISTIC_DEPLOYER } from "../constants.js";
import { MODULE_CREATION, verifyModuleCreation } from "../create2.js";
import { moduleDeployed, deployerPresent } from "../state.js";
import type { TxRequest } from "../txrequest.js";

export async function buildModuleDeploy(client: PublicClient, chainId: number): Promise<{
  alreadyDeployed: boolean; deployerMissing: boolean; tx?: TxRequest;
}> {
  verifyModuleCreation(); // aborts on fixture tampering
  if (await moduleDeployed(client)) return { alreadyDeployed: true, deployerMissing: false };
  if (!(await deployerPresent(client))) return { alreadyDeployed: false, deployerMissing: true };
  return {
    alreadyDeployed: false, deployerMissing: false,
    tx: {
      chainId, to: DETERMINISTIC_DEPLOYER, data: MODULE_CREATION.calldata, value: 0n,
      label: "1) Deploy co-signing module (replay via deterministic deployer)",
      note: "Anyone may send this; result is identical (CREATE2).",
    },
  };
}

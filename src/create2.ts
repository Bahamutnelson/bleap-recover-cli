import { getCreate2Address, keccak256, slice, type Address, type Hex } from "viem";
import { COSIGNING_MODULE, DETERMINISTIC_DEPLOYER } from "./constants.js";
import { MODULE_CREATION_CALLDATA } from "./fixtures/module-creation.js";

export function computeCreate2Address(deployer: Address, salt: Hex, initCode: Hex): Address {
  return getCreate2Address({ from: deployer, salt, bytecodeHash: keccak256(initCode) });
}

const salt = slice(MODULE_CREATION_CALLDATA, 0, 32);
const initCode = slice(MODULE_CREATION_CALLDATA, 32);
export const MODULE_CREATION = { salt, initCode, calldata: MODULE_CREATION_CALLDATA };

export function verifyModuleCreation(): Address {
  const addr = computeCreate2Address(DETERMINISTIC_DEPLOYER, salt, initCode);
  if (addr !== COSIGNING_MODULE) {
    throw new Error(`Module creation fixture mismatch: got ${addr}, expected ${COSIGNING_MODULE}`);
  }
  return addr;
}

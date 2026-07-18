import { getAddress } from "viem";

export const COSIGNING_MODULE = getAddress("0x61576D9ef23514bfe6F080E22CcFFf473cf11A1A");
export const WALLET_FACTORY = getAddress("0xd703aaE79538628d27099B8c4f621bE4CCd142d5");
export const ENTRYPOINT_V07 = getAddress("0x0000000071727De22E5E9d8BAf0edAc6f37da032");
export const DETERMINISTIC_DEPLOYER = getAddress("0x4e59b44847b379578588920cA78FbF26c0B4956C");

export const DEFAULT_TIMELOCK_SEC = 86_400n;
export const MAX_TIMELOCK_SEC = 259_200n;

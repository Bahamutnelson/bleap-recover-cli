// Test-only helpers to CONSTRUCT a PERMISSION-archetype Bleap wallet whose root permission's
// signer is the CosigningModuleV1, installed with a throwaway owner we control on a fork.
//
// This is not tool code: the recovery tool only ever PARSES existing creation data. These helpers
// exist so the fork tests can synthesize a wallet that the chain provably accepts (route A of the
// combined brief), then exercise the real builders against it.
//
// Ground truth (verified on-chain, see task-8-14 report):
//   * FactoryStaker.deployWithFactory(address factory, bytes createData, bytes32 salt) @ WALLET_FACTORY.
//   * createData is a direct Kernel.initialize(bytes21 rootValidator, address hook, bytes validatorData,
//     bytes hookData) call (selector 0x12af322c).
//   * The Bleap Kernel impl that ships this initialize + pairs with CosigningModuleV1 is reached via
//     KernelFactory 0x6723b44Abeec4E71eBE3232BD5B455805baDD22f (impl 0x94F097E1…7D27), NOT the
//     0xaac5… factory (impl 0xBAC8…, a different Kernel version whose initialize selector differs).
//   * PERMISSION rootValidator = 0x02 ++ permissionId(4) ++ 16 zero bytes.
//   * validatorData = abi.encode(bytes[]) with a single signer entry:
//         flag(2) ++ signerModule(20) ++ ownerAddress(20)
//     Kernel calls signer.onInstall(abi.encodePacked(bytes32(permissionId), entry[22:])), and
//     CosigningModuleV1 stores signers[wallet][bytes32(permissionId)] = ownerAddress.
import {
  encodeFunctionData, encodeAbiParameters, parseAbi, parseAbiParameters, concat, pad,
  type Address, type Hex,
} from "viem";
import { COSIGNING_MODULE } from "../../src/constants.js";

// The KernelFactory (approved in the FactoryStaker) whose implementation ships the 0x12af322c
// initialize and pairs with CosigningModuleV1. Discovered from a real Bleap passkey deploy tx.
export const BLEAP_KERNEL_FACTORY: Address = "0x6723b44Abeec4E71eBE3232BD5B455805baDD22f";

const initializeAbi = parseAbi([
  "function initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData)",
]);
const stakerAbi = parseAbi([
  "function deployWithFactory(address factory, bytes createData, bytes32 salt) returns (address)",
]);
export const kernelFactoryAbi = parseAbi([
  "function getAddress(bytes data, bytes32 salt) view returns (address)",
]);

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export function permissionRootValidator(permissionId: Hex): Hex {
  // 0x02 (permission type) ++ permissionId(4) ++ 16 zero bytes = 21 bytes.
  return concat(["0x02", permissionId, pad("0x", { size: 16 })]);
}

export function permissionValidatorData(owner: Address, signerModule: Address = COSIGNING_MODULE): Hex {
  // Single signer entry, no policies: flag(0x0000) ++ signerModule(20) ++ owner(20).
  const entry = concat(["0x0000", signerModule, owner]);
  return encodeAbiParameters(parseAbiParameters("bytes[]"), [[entry]]);
}

// The inner Kernel.initialize(...) createData for a module-permission wallet.
export function buildModuleCreateData(owner: Address, permissionId: Hex): Hex {
  return encodeFunctionData({
    abi: initializeAbi,
    functionName: "initialize",
    args: [permissionRootValidator(permissionId), ZERO_ADDRESS, permissionValidatorData(owner), "0x"],
  });
}

// The full FactoryStaker.deployWithFactory(...) calldata (what buildWalletDeploy replays to WALLET_FACTORY).
export function buildModuleDeployWithFactoryCalldata(
  owner: Address, permissionId: Hex, salt: Hex = pad("0x", { size: 32 }),
  factory: Address = BLEAP_KERNEL_FACTORY,
): { calldata: Hex; createData: Hex; salt: Hex; factory: Address } {
  const createData = buildModuleCreateData(owner, permissionId);
  const calldata = encodeFunctionData({
    abi: stakerAbi, functionName: "deployWithFactory", args: [factory, createData, salt],
  });
  return { calldata, createData, salt, factory };
}

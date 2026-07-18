import {
  decodeFunctionData, decodeAbiParameters, parseAbi, parseAbiParameters,
  getAddress, slice, pad, size, type Address, type Hex,
} from "viem";
import { COSIGNING_MODULE } from "./constants.js";

// Selectors of the two envelopes we may be handed.
const DEPLOY_WITH_FACTORY_SELECTOR = "0xc5265d5d"; // FactoryStaker.deployWithFactory(address,bytes,bytes32)
const INITIALIZE_SELECTOR = "0x12af322c"; // Kernel.initialize(bytes21,address,bytes,bytes)

const deployWithFactoryAbi = parseAbi([
  "function deployWithFactory(address factory, bytes createData, bytes32 salt) returns (address)",
]);
const initializeAbi = parseAbi([
  "function initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData)",
]);

export type WalletArchetype = "permission-module" | "validator";

export type WalletConfig = {
  archetype: WalletArchetype;
  // The 20-byte identifier carried by the 21-byte root ValidationId:
  //   validator archetype  -> the validator contract address (e.g. WebAuthnValidator)
  //   permission archetype -> permissionId(4) ++ 16 zero bytes
  rootValidatorId: Hex;
  // permission archetype only:
  permissionId: Hex | null; // 4 bytes
  signerModule: Address | null; // must be the CosigningModuleV1
  owner: Address | null; // the ECDSA owner installed as the module signer
};

// Unwrap a FactoryStaker.deployWithFactory(...) envelope to its inner Kernel.initialize createData.
// Accepts either the full deployWithFactory calldata or a bare initialize call.
function toInitializeCreateData(creationData: Hex): Hex {
  const selector = slice(creationData, 0, 4).toLowerCase();
  if (selector === DEPLOY_WITH_FACTORY_SELECTOR) {
    const { args } = decodeFunctionData({ abi: deployWithFactoryAbi, data: creationData });
    return args[1] as Hex; // createData
  }
  return creationData;
}

export function parseWalletCreationData(creationData: Hex): WalletConfig {
  const createData = toInitializeCreateData(creationData);
  if (slice(createData, 0, 4).toLowerCase() !== INITIALIZE_SELECTOR) {
    throw new Error(
      `Unrecognized creation data: expected Kernel.initialize (${INITIALIZE_SELECTOR}) or ` +
        `deployWithFactory (${DEPLOY_WITH_FACTORY_SELECTOR}), got ${slice(createData, 0, 4)}`,
    );
  }

  const { args } = decodeFunctionData({ abi: initializeAbi, data: createData });
  const rootValidator = args[0] as Hex; // 21 bytes
  const validatorData = args[2] as Hex;

  if (size(rootValidator) !== 21) {
    throw new Error(`rootValidator must be 21 bytes, got ${size(rootValidator)}`);
  }
  const typeByte = slice(rootValidator, 0, 1).toLowerCase();
  const rootValidatorId = slice(rootValidator, 1, 21); // 20-byte identifier

  if (typeByte === "0x01") {
    // VALIDATOR archetype: a single root validator (e.g. WebAuthn/ECDSA). No cosigning module,
    // no slow-withdrawal path — recovery via this tool's module flow does not apply.
    return {
      archetype: "validator",
      rootValidatorId, // the validator contract address
      permissionId: null,
      signerModule: null,
      owner: null,
    };
  }

  if (typeByte === "0x02") {
    // PERMISSION archetype: root is a permission whose signer is the cosigning module.
    const permissionId = slice(rootValidator, 1, 5); // 4 bytes
    const [entries] = decodeAbiParameters(parseAbiParameters("bytes[]"), validatorData);
    if (entries.length === 0) {
      throw new Error("permission validatorData carries no entries (expected at least a signer)");
    }
    const signerEntry = entries[entries.length - 1] as Hex; // last entry is the signer
    if (size(signerEntry) < 42) {
      throw new Error(`signer entry too short (${size(signerEntry)} bytes; need flag+module+owner)`);
    }
    const signerModule = getAddress(slice(signerEntry, 2, 22));
    const owner = getAddress(slice(signerEntry, 22, 42));
    if (signerModule.toLowerCase() !== COSIGNING_MODULE.toLowerCase()) {
      throw new Error(
        `permission signer module ${signerModule} is not the expected CosigningModule ${COSIGNING_MODULE}`,
      );
    }
    return { archetype: "permission-module", rootValidatorId, permissionId, signerModule, owner };
  }

  throw new Error(`Unsupported root validator type byte ${typeByte} (expected 0x01 or 0x02)`);
}

// The bytes32 module `id` = signers[wallet][id] key = left-aligned permissionId.
// Throws for the validator archetype (no module / no slow-withdrawal id).
export function derivePermissionId(creationData: Hex): Hex {
  const cfg = parseWalletCreationData(creationData);
  if (cfg.archetype !== "permission-module" || cfg.permissionId === null) {
    throw new Error(
      "derivePermissionId: wallet is a plain validator archetype (no cosigning module / permission id); " +
        "there is no slow-withdrawal recovery path for it.",
    );
  }
  return pad(cfg.permissionId, { dir: "right", size: 32 });
}

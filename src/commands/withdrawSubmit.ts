import { concat, encodeFunctionData, size, type Address, type Hex, type PublicClient } from "viem";
import { entryPointV07Abi } from "../abi.js";
import { ENTRYPOINT_V07 } from "../constants.js";
import { slowWithdrawStatus } from "../state.js";
import type { PackedUserOp } from "../userop.js";
import type { TxRequest } from "../txrequest.js";

// Kernel v3.1 selects the permission's signer only after the userOp signature is consumed by the
// permission's policy list; the byte immediately following the policy signatures must be the signer
// prefix 0xff (ValidationManager._checkUserOpPolicy reverts SignerPrefixNotPresent otherwise). Our
// recovery permission carries no policies, so the wire signature is simply 0xff ++ ownerSig(65).
const SIGNER_PREFIX: Hex = "0xff";

function withSignerPrefix(signature: Hex): Hex {
  // Idempotent: accept an already-prefixed 66-byte signature, wrap a bare 65-byte ECDSA signature.
  if (size(signature) === 66 && signature.slice(0, 4).toLowerCase() === "0xff") return signature;
  return concat([SIGNER_PREFIX, signature]);
}

export async function buildWithdrawSubmit(opts: {
  client: PublicClient; chainId: number; wallet: Address; userOp: PackedUserOp; signature: Hex; beneficiary: Address;
}): Promise<TxRequest> {
  const status = await slowWithdrawStatus(opts.client, opts.wallet);
  if (status.remainingSec > 0n) {
    throw new Error(`Slow-Withdrawal timelock not elapsed: ${status.remainingSec}s remaining`);
  }
  const signed = { ...opts.userOp, signature: withSignerPrefix(opts.signature) };
  return {
    chainId: opts.chainId, to: ENTRYPOINT_V07, value: 0n,
    data: encodeFunctionData({ abi: entryPointV07Abi, functionName: "handleOps", args: [[signed as any], opts.beneficiary] }),
    label: "3c) Complete the Slow Withdrawal (handleOps)",
    note: "Submittable by any EOA with gas. Funds go to your chosen destination.",
  };
}

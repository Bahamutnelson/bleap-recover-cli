import {
  encodeFunctionData, encodePacked, concat, pad, type Address, type Hex, type PublicClient,
} from "viem";
import { kernelExecuteAbi, entryPointV07Abi } from "./abi.js";
import { ENTRYPOINT_V07 } from "./constants.js";
import { nonceKeyFor } from "./nonce.js";

const CALLTYPE_SINGLE_MODE: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function encodeExecuteCallData(target: Address, value: bigint, innerData: Hex): Hex {
  const executionCalldata = encodePacked(["address", "uint256", "bytes"], [target, value, innerData]);
  return encodeFunctionData({ abi: kernelExecuteAbi, functionName: "execute", args: [CALLTYPE_SINGLE_MODE, executionCalldata] });
}

export type PackedUserOp = {
  sender: Address; nonce: bigint; initCode: Hex; callData: Hex;
  accountGasLimits: Hex; preVerificationGas: bigint; gasFees: Hex; paymasterAndData: Hex; signature: Hex;
};

const packTwo = (hi: bigint, lo: bigint): Hex =>
  concat([pad(`0x${hi.toString(16)}`, { size: 16 }), pad(`0x${lo.toString(16)}`, { size: 16 })]);

export function packUserOpForHash(userOp: PackedUserOp) {
  return {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    accountGasLimits: userOp.accountGasLimits,
    preVerificationGas: userOp.preVerificationGas,
    gasFees: userOp.gasFees,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
}

export async function buildUnsignedUserOp(opts: {
  client: PublicClient; wallet: Address; callData: Hex;
  verificationGasLimit?: bigint; callGasLimit?: bigint; preVerificationGas?: bigint;
}): Promise<{ userOp: PackedUserOp; userOpHash: Hex; prefundWei: bigint }> {
  const key = nonceKeyFor(0x00, undefined, 0); // ROOT
  const nonce = await opts.client.readContract({
    address: ENTRYPOINT_V07, abi: entryPointV07Abi, functionName: "getNonce", args: [opts.wallet, key],
  });
  const fees = await opts.client.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas ?? 1_000_000_000n;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 1_000_000_000n;

  const verificationGasLimit = opts.verificationGasLimit ?? 600_000n;
  const callGasLimit = opts.callGasLimit ?? 500_000n;
  const preVerificationGas = opts.preVerificationGas ?? 200_000n;

  const userOp: PackedUserOp = {
    sender: opts.wallet, nonce, initCode: "0x", callData: opts.callData,
    accountGasLimits: packTwo(verificationGasLimit, callGasLimit),
    preVerificationGas, gasFees: packTwo(maxPriorityFeePerGas, maxFeePerGas),
    paymasterAndData: "0x", signature: `0x${"00".repeat(65)}`,
  };
  const userOpHash = await opts.client.readContract({
    address: ENTRYPOINT_V07, abi: entryPointV07Abi, functionName: "getUserOpHash", args: [packUserOpForHash(userOp) as any],
  });
  const prefundWei = (verificationGasLimit + callGasLimit + preVerificationGas) * maxFeePerGas;
  return { userOp, userOpHash, prefundWei };
}

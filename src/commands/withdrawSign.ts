import { encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi } from "../abi.js";
import { encodeExecuteCallData, buildUnsignedUserOp, type PackedUserOp } from "../userop.js";
import { nativeBalance } from "../state.js";
import { ENTRYPOINT_V07 } from "../constants.js";
import { entryPointV07Abi } from "../abi.js";
import type { TxRequest } from "../txrequest.js";

export async function buildWithdrawSign(opts: {
  client: PublicClient; chainId: number; wallet: Address; to: Address; token?: Address; amount?: bigint;
}): Promise<{ userOp: PackedUserOp; userOpHash: Hex; depositTx?: TxRequest; personalSignMessage: Hex }> {
  let callData: Hex;
  if (opts.token) {
    if (opts.amount === undefined) throw new Error("--amount required for ERC-20 withdrawal");
    const inner = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [opts.to, opts.amount] });
    callData = encodeExecuteCallData(opts.token, 0n, inner);
  } else {
    if (opts.amount === undefined) throw new Error("--amount required (native amount in wei)");
    callData = encodeExecuteCallData(opts.to, opts.amount, "0x");
  }
  const { userOp, userOpHash, prefundWei } = await buildUnsignedUserOp({ client: opts.client, wallet: opts.wallet, callData });

  let depositTx: TxRequest | undefined;
  const bal = await nativeBalance(opts.client, opts.wallet);
  if (bal < prefundWei) {
    depositTx = {
      chainId: opts.chainId, to: ENTRYPOINT_V07, value: prefundWei - bal,
      data: encodeFunctionData({ abi: entryPointV07Abi, functionName: "depositTo", args: [opts.wallet] }),
      label: "3b-pre) Fund gas prefund (wallet has no native token)",
      note: "Sent by any gas payer; tops up the wallet's EntryPoint deposit so the UserOp can pay gas.",
    };
  }
  return { userOp, userOpHash, depositTx, personalSignMessage: userOpHash };
}

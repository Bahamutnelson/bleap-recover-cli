import { encodeFunctionData, type Address, type Hex } from "viem";
import { cosigningModuleAbi } from "../abi.js";
import { COSIGNING_MODULE } from "../constants.js";
import type { TxRequest } from "../txrequest.js";

export function buildWithdrawStart(opts: { chainId: number; wallet: Address; id: Hex }): TxRequest {
  return {
    chainId: opts.chainId, to: COSIGNING_MODULE, value: 0n,
    data: encodeFunctionData({ abi: cosigningModuleAbi, functionName: "triggerSlowWithdraw", args: [opts.id, opts.wallet] }),
    label: "3a) Start the Slow Withdrawal (trigger)",
    note: "MUST be sent by the owner key itself (msg.sender == your signer). Starts the timelock.",
  };
}

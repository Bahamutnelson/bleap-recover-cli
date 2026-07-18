import { type Address, type Hex, type PublicClient } from "viem";
import { cosigningModuleAbi, erc20Abi } from "./abi.js";
import { COSIGNING_MODULE, DETERMINISTIC_DEPLOYER } from "./constants.js";

export async function isContractDeployed(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address });
  return !!code && code !== "0x";
}
export const moduleDeployed = (c: PublicClient) => isContractDeployed(c, COSIGNING_MODULE);
export const deployerPresent = (c: PublicClient) => isContractDeployed(c, DETERMINISTIC_DEPLOYER);

export async function discoverSignerId(
  client: PublicClient, wallet: Address, id: Hex, owner?: Address,
): Promise<{ id: Hex; owner: Address } | null> {
  const signer = await client.readContract({
    address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "signers", args: [wallet, id],
  });
  if (signer === "0x0000000000000000000000000000000000000000") return null;
  if (owner && signer.toLowerCase() !== owner.toLowerCase()) return null;
  return { id, owner: signer };
}

export async function slowWithdrawStatus(client: PublicClient, wallet: Address) {
  const [triggeredAt, timelockSec] = await Promise.all([
    client.readContract({ address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "triggeredSlowWithdrawals", args: [wallet] }),
    client.readContract({ address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "timelockForSlowWithdraw" }),
  ]);
  let remainingSec = 0n;
  if (triggeredAt > 0n) {
    remainingSec = await client.readContract({
      address: COSIGNING_MODULE, abi: cosigningModuleAbi, functionName: "remainingSlowWithdrawTime", args: [wallet],
    });
  }
  return { triggeredAt, remainingSec, timelockSec };
}

export async function nativeBalance(client: PublicClient, address: Address) {
  return client.getBalance({ address });
}
export async function erc20Balance(client: PublicClient, token: Address, address: Address) {
  const [raw, decimals, symbol] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  ]);
  return { raw, decimals, symbol };
}

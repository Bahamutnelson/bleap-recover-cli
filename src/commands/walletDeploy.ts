import { type Address, type Hex, type PublicClient } from "viem";
import { WALLET_FACTORY } from "../constants.js";
import { isContractDeployed } from "../state.js";
import type { TxRequest } from "../txrequest.js";

export async function buildWalletDeploy(opts: {
  targetClient: PublicClient; sourceClient: PublicClient; wallet: Address; chainId: number;
  txHash?: Hex; creationData?: Hex;
}): Promise<{ alreadyDeployed: boolean; tx?: TxRequest; creationData: Hex }> {
  if (await isContractDeployed(opts.targetClient, opts.wallet)) {
    return { alreadyDeployed: true, creationData: "0x" };
  }
  let creationData = opts.creationData;
  if (!creationData) {
    if (!opts.txHash) throw new Error("Provide --creation-data or --tx-hash");
    const tx = await opts.sourceClient.getTransaction({ hash: opts.txHash });
    if (!tx.to || tx.to.toLowerCase() !== WALLET_FACTORY.toLowerCase()) {
      throw new Error(`Source tx ${opts.txHash} was not sent to the wallet factory (${tx.to})`);
    }
    creationData = tx.input;
  }
  return {
    alreadyDeployed: false, creationData,
    tx: {
      chainId: opts.chainId, to: WALLET_FACTORY, data: creationData, value: 0n,
      label: "2) Deploy your wallet (replay creation data to the factory)",
      note: "Deploys at your exact address via CREATE2. Anyone may send it.",
    },
  };
}

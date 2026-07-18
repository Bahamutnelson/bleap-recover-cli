import type { Address, Hex } from "viem";

export type TxRequest = {
  chainId: number; to: Address; data: Hex; value: bigint; label: string; note?: string;
};

export function formatTxRequest(tx: TxRequest, explorer?: string): string {
  const lines = [
    `── ${tx.label} ──`,
    `  chainId: ${tx.chainId}`,
    `  to: ${tx.to}`,
    `  value: ${tx.value.toString()} wei`,
    `  data: ${tx.data}`,
  ];
  if (explorer) lines.push(`  to (explorer): ${explorer}/address/${tx.to}`);
  if (tx.note) lines.push(`  note: ${tx.note}`);
  lines.push(`  → Sign & send this in your own wallet (Rabby/MetaMask: paste "data" as hex). The tool never sends it.`);
  return lines.join("\n");
}

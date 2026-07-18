export type ChainInfo = { id: number; name: string; rpcUrl: string; explorer: string };

const REGISTRY: ChainInfo[] = [
  { id: 1, name: "ethereum", rpcUrl: "https://eth.llamarpc.com", explorer: "https://etherscan.io" },
  { id: 42161, name: "arbitrum", rpcUrl: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io" },
  { id: 8453, name: "base", rpcUrl: "https://mainnet.base.org", explorer: "https://basescan.org" },
  { id: 10, name: "optimism", rpcUrl: "https://mainnet.optimism.io", explorer: "https://optimistic.etherscan.io" },
  { id: 137, name: "polygon", rpcUrl: "https://polygon-rpc.com", explorer: "https://polygonscan.com" },
  { id: 56, name: "bsc", rpcUrl: "https://bsc-dataseed.binance.org", explorer: "https://bscscan.com" },
];

export function resolveChain(idOrName: string | number, rpcOverride?: string): ChainInfo {
  const key = typeof idOrName === "string" ? idOrName.toLowerCase() : idOrName;
  const found = REGISTRY.find((c) => c.id === key || c.name === key);
  if (found) return rpcOverride ? { ...found, rpcUrl: rpcOverride } : found;

  const asId = typeof key === "number" ? key : Number(key);
  if (Number.isInteger(asId) && rpcOverride) {
    return { id: asId, name: `chain-${asId}`, rpcUrl: rpcOverride, explorer: "" };
  }
  throw new Error(`Unknown chain "${idOrName}". Pass --rpc <url> to use an unlisted chain.`);
}

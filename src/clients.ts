import { createPublicClient, http, defineChain, type PublicClient } from "viem";
import type { ChainInfo } from "./chains.js";

export function makePublicClient(chain: ChainInfo): PublicClient {
  const viemChain = defineChain({
    id: chain.id,
    name: chain.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  });
  return createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });
}

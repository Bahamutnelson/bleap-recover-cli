import { type Address, type Hex, type PublicClient } from "viem";
import { moduleDeployed, deployerPresent, isContractDeployed, discoverSignerId, slowWithdrawStatus, nativeBalance, erc20Balance } from "../state.js";

export type StatusReport = {
  moduleDeployed: boolean; deployerPresent: boolean; walletDeployed: boolean;
  signerId: Hex | null; signerOwner: Address | null;
  triggeredAt: bigint; remainingSec: bigint; timelockSec: bigint;
  native: bigint; token?: { symbol: string; raw: bigint; decimals: number };
};

export async function getStatus(opts: {
  client: PublicClient; wallet: Address; id?: Hex; owner?: Address; token?: Address;
}): Promise<StatusReport> {
  const [mod, dep, walletDeployed, sw, native] = await Promise.all([
    moduleDeployed(opts.client), deployerPresent(opts.client),
    isContractDeployed(opts.client, opts.wallet),
    slowWithdrawStatus(opts.client, opts.wallet), nativeBalance(opts.client, opts.wallet),
  ]);
  let signer: { id: Hex; owner: Address } | null = null;
  if (opts.id) signer = await discoverSignerId(opts.client, opts.wallet, opts.id, opts.owner);
  const token = opts.token ? await erc20Balance(opts.client, opts.token, opts.wallet) : undefined;
  return {
    moduleDeployed: mod, deployerPresent: dep, walletDeployed,
    signerId: signer?.id ?? null, signerOwner: signer?.owner ?? null,
    triggeredAt: sw.triggeredAt, remainingSec: sw.remainingSec, timelockSec: sw.timelockSec,
    native, token,
  };
}

export function formatStatus(r: StatusReport): string {
  const lines = [
    "Bleap recovery status",
    `  module deployed:   ${r.moduleDeployed}`,
    `  deterministic dep: ${r.deployerPresent}`,
    `  wallet deployed:   ${r.walletDeployed}`,
    `  signer id:         ${r.signerId ?? "(not resolved)"}`,
    `  signer owner:      ${r.signerOwner ?? "(unknown)"}`,
    `  Slow-Withdrawal:   triggeredAt=${r.triggeredAt} remaining=${r.remainingSec}s timelock=${r.timelockSec}s`,
    `  native balance:    ${r.native} wei`,
  ];
  if (r.token) lines.push(`  token balance:     ${r.token.raw} (${r.token.symbol}, ${r.token.decimals} dp)`);
  return lines.join("\n");
}

import { hexToBigInt, type Hex } from "viem";

type Opts = { vType?: number; mode?: number; identifier?: Hex; nonceKey?: number; seq: bigint };

export function encodeKernelNonce(opts: Opts): bigint {
  const mode = BigInt(opts.mode ?? 0) & 0xffn;
  const vType = BigInt(opts.vType ?? 0) & 0xffn;
  const identifier = opts.identifier ? hexToBigInt(opts.identifier) & ((1n << 160n) - 1n) : 0n;
  const nonceKey = BigInt(opts.nonceKey ?? 0) & 0xffffn;
  const seq = opts.seq & ((1n << 64n) - 1n);
  return (mode << 248n) | (vType << 240n) | (identifier << 80n) | (nonceKey << 64n) | seq;
}

export function nonceKeyFor(vType: number, identifier: Hex | undefined, nonceKey: number): bigint {
  return encodeKernelNonce({ vType, identifier, nonceKey, seq: 0n }) >> 64n;
}

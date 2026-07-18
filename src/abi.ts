import { parseAbi } from "viem";

export const cosigningModuleAbi = parseAbi([
  "function triggerSlowWithdraw(bytes32 id, address wallet)",
  "function unTriggerSlowWithdraw(bytes32 id, address wallet)",
  "function remainingSlowWithdrawTime(address wallet) view returns (uint256)",
  "function triggeredSlowWithdrawals(address wallet) view returns (uint256)",
  "function timelockForSlowWithdraw() view returns (uint256)",
  "function signers(address wallet, bytes32 id) view returns (address)",
  "function usedIds(address wallet) view returns (uint256)",
]);

export const entryPointV07Abi = parseAbi([
  "struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }",
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash(PackedUserOperation userOp) view returns (bytes32)",
  "function handleOps(PackedUserOperation[] ops, address beneficiary)",
  "function depositTo(address account) payable",
  "function balanceOf(address account) view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// Kernel v3 execute(bytes32 execMode, bytes executionCalldata)
export const kernelExecuteAbi = parseAbi([
  "function execute(bytes32 execMode, bytes executionCalldata)",
]);

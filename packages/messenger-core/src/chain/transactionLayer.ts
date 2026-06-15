import type { Address, Hash } from "viem";

export type MessengerContractCall = {
  to: Address;
  data: `0x${string}`;
};

export type MessengerTransactionLayer = {
  writeContract(args: {
    address: Address;
    abi: any;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<Hash>;

  sendCallsBatch?(calls: MessengerContractCall[]): Promise<boolean>;
};

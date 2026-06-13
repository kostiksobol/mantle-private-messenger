import type { Address } from "viem";

export const MAIN_CONNECTOR_ADDRESS =
  import.meta.env.VITE_MAIN_CONNECTOR_ADDRESS as Address | undefined;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const mainConnectorAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "login", type: "string" },
      { name: "name", type: "string" },
      { name: "pubkey", type: "string" },
      { name: "kind", type: "uint8" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addRecord",
    stateMutability: "nonpayable",
    inputs: [{ name: "record", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getLastRecords",
    stateMutability: "view",
    inputs: [{ name: "from", type: "uint256" }],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    type: "function",
    name: "getUserByAddress",
    stateMutability: "view",
    inputs: [{ name: "userAddress", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "userAddress", type: "address" },
          { name: "login", type: "string" },
          { name: "name", type: "string" },
          { name: "pubkey", type: "string" },
          { name: "userContract", type: "address" },
          { name: "kind", type: "uint8" },
          { name: "metadataURI", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getUserByLogin",
    stateMutability: "view",
    inputs: [{ name: "login", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "userAddress", type: "address" },
          { name: "login", type: "string" },
          { name: "name", type: "string" },
          { name: "pubkey", type: "string" },
          { name: "userContract", type: "address" },
          { name: "kind", type: "uint8" },
          { name: "metadataURI", type: "string" },
        ],
      },
    ],
  },
] as const;

export const userContractAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "addMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "encryptedContent", type: "string" },
      { name: "tag", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getLastMessages",
    stateMutability: "view",
    inputs: [{ name: "from", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "encryptedContent", type: "string" },
          { name: "tag", type: "string" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getMessage",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "encryptedContent", type: "string" },
          { name: "tag", type: "string" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
] as const;

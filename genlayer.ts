import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
type Address = `0x${string}`;

const ACCOUNT_KEY = "ai_gov_account_pk";
const CONTRACT_KEY = "ai_gov_contract_address";
const WALLET_MODE_KEY = "ai_gov_wallet_mode"; // "burner" | "metamask"

export const DEFAULT_CONTRACT_ADDRESS =
  "0xb680071Fae37320BeA1D5EF7375Fc81f7a342DcE" as Address;

export const STUDIO_CHAIN = {
  id: 61999,
  name: "GenLayer Studio",
  hexId: "0xF22F", // 61999
  rpcUrl: "https://studio.genlayer.com/api",
  explorer: "https://explorer-studio.genlayer.com/",
};

export type WalletMode = "burner" | "metamask";

export function getWalletMode(): WalletMode {
  if (typeof window === "undefined") return "burner";
  return (localStorage.getItem(WALLET_MODE_KEY) as WalletMode) || "burner";
}

export function setWalletMode(mode: WalletMode) {
  localStorage.setItem(WALLET_MODE_KEY, mode);
}

export function getOrCreateAccount() {
  let pk = typeof window !== "undefined" ? localStorage.getItem(ACCOUNT_KEY) : null;
  if (!pk) {
    pk = generatePrivateKey();
    if (typeof window !== "undefined") localStorage.setItem(ACCOUNT_KEY, pk);
  }
  return createAccount(pk as `0x${string}`);
}

export function getContractAddress(): Address {
  if (typeof window === "undefined") return DEFAULT_CONTRACT_ADDRESS;
  const v = localStorage.getItem(CONTRACT_KEY);
  return (v as Address) || DEFAULT_CONTRACT_ADDRESS;
}

export function setContractAddress(addr: string) {
  localStorage.setItem(CONTRACT_KEY, addr);
}

function getEthereum(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).ethereum ?? null;
}

export function hasMetaMask(): boolean {
  return !!getEthereum();
}

export async function ensureStudioChain(): Promise<void> {
  const eth = getEthereum();
  if (!eth) throw new Error("MetaMask not detected");
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIO_CHAIN.hexId }],
    });
  } catch (err: any) {
    // 4902 = chain not added
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message ?? "")) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: STUDIO_CHAIN.hexId,
            chainName: STUDIO_CHAIN.name,
            rpcUrls: [STUDIO_CHAIN.rpcUrl],
            nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
            blockExplorerUrls: [STUDIO_CHAIN.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function connectMetaMask(): Promise<Address> {
  const eth = getEthereum();
  if (!eth) throw new Error("MetaMask not detected. Install it from metamask.io");
  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("No MetaMask account returned");
  await ensureStudioChain();
  setWalletMode("metamask");
  return accounts[0] as Address;
}

/**
 * Read-only client (uses burner account; safe for reads regardless of wallet).
 */
export function makeReadClient() {
  const account = getOrCreateAccount();
  return createClient({
    chain: studionet,
    account,
    endpoint: STUDIO_CHAIN.rpcUrl,
  });
}

/**
 * Write client. GenLayer Studio is gasless, so we always sign transactions
 * with the local burner account. MetaMask (when connected) is used purely as
 * an identity/display layer — the burner account submits the actual tx.
 */
export function makeWriteClient() {
  const account = getOrCreateAccount();
  return createClient({
    chain: studionet,
    account,
    endpoint: STUDIO_CHAIN.rpcUrl,
  });
}

export type Proposal = {
  id: number;
  proposer: string;
  proposal: string;
  decision: string;
  reason: string;
};

// 只读链上读取 LoveVault 的 NAV / TVL（与 functions/api/live-stats.js 同口径：÷1e6）。
// 仅在用户发 !nav 时调用，bot 不持私钥、不发起交易。
import { JsonRpcProvider, Contract } from "ethers";

const VAULT = "0x16A7F8CfAD687A87183fCbd1dF7aF09dce05D357";
const ROUTER = "0x2348ec656e395edAbcE2e198DC44647456d81867";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ABI = [
  "function nav() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
];

export async function getVaultStats(rpcUrl) {
  if (!rpcUrl) throw new Error("未配置 RPC_URL");
  const provider = new JsonRpcProvider(rpcUrl);
  const c = new Contract(VAULT, ABI, provider);
  const [nav, ta] = await Promise.all([c.nav(), c.totalAssets()]);
  return {
    nav: Number(nav) / 1e6,
    totalAssetsUsdc: Number(ta) / 1e6,
    vault: VAULT,
    router: ROUTER,
    usdc: USDC,
  };
}

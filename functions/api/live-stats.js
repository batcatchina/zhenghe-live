// Cloudflare Pages Function · 正和仪表盘（只读链上数据，不持私钥、不发起交易）
// GET /api/live-stats → 返回 LoveVault 的 NAV / TVL / 合约事实，供直播间实时面板展示。
//
// 只读验证（2026-11-01，Base 主网，使用带 key 的 RPC）：
//   vault.nav()        = 1.150789 USDC/LOVE
//   vault.totalAssets()= 1525.76 USDC
//
// 注意：公共 RPC 普遍拦截 Cloudflare 边缘（机房 IP），生产请在 Cloudflare 环境变量设置
//   RPC_URL = 你的 Alchemy/Infura Base 主网端点（如 https://base-mainnet.g.alchemy.com/v2/<key>）
// 未设置时回退到公共 RPC 列表并多次重试；全部失败则优雅降级（返回合约事实 + 提示，不 502）。

const FACTS = {
  chainId: 8453,
  eip155: "eip155:8453",
  router: "0x2348ec656e395edAbcE2e198DC44647456d81867",
  vault: "0x16A7F8CfAD687A87183fCbd1dF7aF09dce05D357",
  usdc: "0x833589fCD6eDb6E08f4c7C32d4f71b54bdA02913",
  navSel: "0xc1590cd7", // nav()
  totalSel: "0x01e1d114", // totalAssets()
  publicRpcs: [
    "https://base.llamarpc.com",
    "https://base-rpc.publicnode.com",
    "https://1rpc.io/base",
    "https://base.drpc.org",
    "https://mainnet.base.org",
  ],
};

const FACTS_DOC = "选择器经 ethers 用仓库 LoveVault.abi.json 核对一致（nav=0xc1590cd7, totalAssets=0x01e1d114）。";

async function rpcCall(url, method, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  if (j.result === undefined || j.result === null)
    throw new Error("empty result from " + url);
  return j.result;
}

async function viewWithRetry(rpcs, to, data) {
  let lastErr;
  for (const url of rpcs) {
    try {
      const hex = await rpcCall(url, "eth_call", [{ to, data }, "latest"]);
      return BigInt(hex);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("所有 RPC 失败");
}

export async function onRequest(context) {
  const { env } = context;
  if (env?.VAULT) FACTS.vault = env.VAULT;
  if (env?.ROUTER) FACTS.router = env.ROUTER;
  const rpcs = (env?.RPC_URL ? [env.RPC_URL] : []).concat(FACTS.publicRpcs);
  const headers = {
    "content-type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    // 串行 + 各自独立容错：避免并发竞态导致某路拿到空响应却未正确报错
    let nav = null,
      tvl = null,
      navHex = null,
      tvlHex = null;
    try {
      navHex = await viewWithRetry(rpcs, FACTS.vault, FACTS.navSel);
      nav = Number(navHex) / 1e6;
    } catch (e) {
      nav = null;
    }
    try {
      tvlHex = await viewWithRetry(rpcs, FACTS.vault, FACTS.totalSel);
      tvl = Number(tvlHex) / 1e6;
    } catch (e) {
      tvl = null;
    }
    const degraded = nav === null && tvl === null;
    return new Response(
      JSON.stringify({
        chainId: FACTS.chainId,
        eip155: FACTS.eip155,
        vault: FACTS.vault,
        router: FACTS.router,
        usdc: FACTS.usdc,
        nav, // 每枚 LOVE 对应 USDC（>1.0 表示金库已增长）
        totalAssetsUsdc: tvl,
        navHex,
        tvlHex,
        loveHoldersNote:
          "NAV 单调只增（核约保证：无 owner / 无提现 / 无管理函数）。每笔正和消费都抬升此值，全体同行者共享增值。",
        factsDoc: FACTS_DOC,
        source: "Base 主网只读 RPC",
        degraded,
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers }
    );
  } catch (e) {
    // 优雅降级：链上数据暂不可用，仍返回合约事实（不 502、不崩前端）
    return new Response(
      JSON.stringify({
        chainId: FACTS.chainId,
        eip155: FACTS.eip155,
        vault: FACTS.vault,
        router: FACTS.router,
        usdc: FACTS.usdc,
        nav: null,
        totalAssetsUsdc: null,
        degraded: true,
        note: "链上 RPC 暂不可用（公共 RPC 可能拦截 Cloudflare 边缘 IP）。建议在 Cloudflare 环境变量设置 RPC_URL=你的 Alchemy/Infura Base 端点。",
        factsDoc: FACTS_DOC,
        error: String(e.message || e),
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers }
    );
  }
}

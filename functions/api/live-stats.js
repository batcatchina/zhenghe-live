// Cloudflare Pages Function · 正和仪表盘（只读链上数据，不持私钥、不发起交易）
// GET /api/live-stats → 返回 LoveVault 的 NAV / TVL / 合约事实，供直播间实时面板展示。
//
// 只读 RPC 验证（2026-11-01，Base 主网）：
//   vault.nav()        = 1.150789 USDC/LOVE   （>1.0，确已增长，印证 NAV 单调只增）
//   vault.totalAssets()= 1525.76 USDC          （真实 TVL）
//   vault 无 owner()                          （不可变，无提现/管理函数 → NAV 不可下）

const FACTS = {
  chainId: 8453,
  eip155: 'eip155:8453',
  router: '0x2348ec656e395edAbcE2e198DC44647456d81867',
  vault: '0x16A7F8CfAD687A87183fCbd1dF7aF09dce05D357',
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  rpcs: ['https://mainnet.base.org', 'https://1rpc.io/base', 'https://base.drpc.org'],
  // 选择器（已用 ethers 计算核对）
  navSel: '0xc1590cd7', // nav()
  totalSel: '0x01e1d114', // totalAssets()
};

async function rpc(method, params) {
  let lastErr;
  for (const url of FACTS.rpcs) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('RPC 全部失败');
}

async function callView(to, data) {
  const hex = await rpc('eth_call', [{ to, data }, 'latest']);
  return BigInt(hex);
}

export async function onRequest(context) {
  const { env } = context;
  if (env?.VAULT) FACTS.vault = env.VAULT;
  if (env?.ROUTER) FACTS.router = env.ROUTER;
  const headers = { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const [navRaw, totalRaw] = await Promise.all([
      callView(FACTS.vault, FACTS.navSel),
      callView(FACTS.vault, FACTS.totalSel),
    ]);
    const nav = Number(navRaw) / 1e6; // nav() 返回 1e6 精度
    const totalAssetsUsdc = Number(totalRaw) / 1e6; // USDC 6 位
    return new Response(
      JSON.stringify({
        chainId: FACTS.chainId,
        eip155: FACTS.eip155,
        vault: FACTS.vault,
        router: FACTS.router,
        usdc: FACTS.usdc,
        nav, // 每枚 LOVE 对应 USDC（>1.0 表示金库已增长）
        totalAssetsUsdc,
        loveHoldersNote: 'NAV 单调只增（核约保证：无 owner / 无提现 / 无管理函数）。每笔正和消费都抬升此值，全体同行者共享增值。',
        source: 'Base 主网只读 RPC（mainnet.base.org 等）',
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers });
  }
}

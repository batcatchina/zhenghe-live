// Cloudflare Pages Function · 构造"正和消费"的 x402 支付请求
// POST /api/live-pay  body: { liveId, host, referrer?, usdcAmount, action }
// 返回 HTTP 402 + x402 标准支付要求（router.pay calldata + USDC approve）。
// 服务端不持私钥、不碰资金；由观众钱包在 x402 流程中签名提交。
import { ethers } from 'ethers';

// ── 链上地址（来自 Cloudflare 环境变量，勿硬编码进仓库）──
// ROUTER / LOVEVAULT / USDC 由 zhenghe-system/src/lib/facts.ts 收口，保持一致。

// ZhengHeRouter ABI（最小集）。
// ⚠️ 部署前请对照 contracts/v4/ZhengHeRouter.sol 复核 pay 的精确签名与参数顺序。
const ROUTER_ABI = [
  'function pay(uint256 assets, address merchant, bytes32 ref, address leader) returns (uint256)',
  'function payWithLove(uint256 loveAmount, address merchant, bytes32 ref, address leader) returns (uint256)',
];
const USDC_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { liveId, host, referrer, usdcAmount, action = 'consume' } = body;
  if (!liveId || !host || !usdcAmount) {
    return json({ error: 'liveId, host, usdcAmount required' }, 400);
  }
  if (!ethers.isAddress(host)) return json({ error: 'invalid host address' }, 400);

  const ROUTER = env.ROUTER;
  const USDC = env.USDC;
  const leader = referrer && ethers.isAddress(referrer) ? referrer : ethers.ZeroAddress;

  // USDC 6 位精度；router.pay 的 assets 以 USDC base unit 计
  const amount = ethers.parseUnits(String(usdcAmount), 6);
  // ref 用直播间 ID 编码为 bytes32（截断保护）
  const ref = ethers.encodeBytes32String(String(liveId).slice(0, 31) || 'live');

  const routerIface = new ethers.Interface(ROUTER_ABI);
  const usdcIface = new ethers.Interface(USDC_ABI);

  const payCalldata = routerIface.encodeFunctionData('pay', [amount, host, ref, leader]);
  const approveCalldata = usdcIface.encodeFunctionData('approve', [ROUTER, amount]);

  // x402 v1 exact scheme：观众钱包签名提交 pay 交易前需先 approve USDC 给 router
  const payment = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'base',
        maxAmountRequired: amount.toString(),
        resource: request.url,
        description: `正和直播消费: ${action} @ ${liveId}`,
        mimeType: 'application/json',
        payTo: ROUTER,
        maxTimeoutSeconds: 60,
        asset: USDC,
        extra: {
          // 主交易：调用 router.pay，由合约内部拉取观众 USDC 并分账+注库
          to: ROUTER,
          calldata: payCalldata,
          // 前置交易：观众授权 router 代拉 USDC
          approve: { to: USDC, calldata: approveCalldata },
        },
      },
    ],
  };

  // 402 = Payment Required（x402 标准响应码）
  return new Response(JSON.stringify(payment), {
    status: 402,
    headers: { 'content-type': 'application/json' },
  });
}

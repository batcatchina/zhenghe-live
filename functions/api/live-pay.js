// Cloudflare Pages Function · 正和消费 x402 端点（对齐 zhenghe-system 真实实现）
//
// 流程：
//   GET/POST 无 X-PAYMENT  → 返回 HTTP 402 + x402 支付要求（router.pay calldata + USDC approve）
//   POST 带 X-PAYMENT:{tx} → 链上校验 router Paid 事件，通过则解锁「直播特权」（提问/回放/打赏）
//
// 设计原则（与 zhenghe-system/functions/api/_src/x402.mjs 完全一致）：
//   1) 正和-native：支付 = 一次 ZhengHeRouter.pay，商户收 USDC + 捐赠/手续费注入 LoveVault → NAV 抬升
//   2) 链上校验：eth_getTransactionReceipt 验 Paid 事件，绝不靠信任
//   3) 服务端不持私钥、不碰资金、不存密钥
//   4) 地址为只读事实（事实层），默认即 Base 主网已验证合约，可用环境变量覆盖
//
// 已用只读 RPC 验证（2026-11-01）：三合约均已部署，router.vault==LoveVault，
// router.usdc==USDC，pay 选择器 0x7a17ac71 与 keccak 计算值一致，vault.nav()=1.150789。

// ── 事实层（与 zhenghe-system/src/lib/facts.ts 同源，地址恒真不漂移）──
const FACTS = {
  chainId: 8453,
  eip155: 'eip155:8453',
  router: '0x2348ec656e395edAbcE2e198DC44647456d81867',
  vault: '0x16A7F8CfAD687A87183fCbd1dF7aF09dce05D357',
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  assetDecimals: 6,
  // pay(uint256 assets, bytes32 ref, address merchant, address leaderParam) -> bool
  paySelector: '0x7a17ac71',
  payMethod: 'pay(uint256,bytes32,address,address)',
  // Paid(address,address,uint256,uint256,uint256,uint256,bytes32)
  paidTopic: '0x5ac5e317c163bd75895c0fcb4300ef1e1a96ba9ee9c27cf5ca54f517b13bc653',
  rpcs: ['https://mainnet.base.org', 'https://1rpc.io/base', 'https://base.drpc.org'],
};
const APPROVE_SEL = '0x095ea7b3';

// ── 纯 JS ABI 编码（避免引入 ethers，保持边缘轻量）──
const hx = (s) => (s.startsWith('0x') ? s.slice(2) : s);
const pad32 = (hexNo0x) => hexNo0x.toLowerCase().padStart(64, '0').slice(-64);
const addr = (a) => pad32(hx(a));
const uint = (n) => pad32(BigInt(n).toString(16));
const approveData = (spender, amount) => APPROVE_SEL + addr(spender) + uint(amount);
const payData = (assets, ref, merchant, leader) =>
  FACTS.paySelector + uint(assets) + pad32(hx(ref)) + addr(merchant) + addr(leader);

// ── 只读 RPC（多节点兜底）──
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
const addrFromTopic = (t) => '0x' + String(t).slice(26).toLowerCase();

// 链上校验 router Paid 事件（与 zhenghe-system _chain.mjs 同口径）
async function verifyPaidTx(txHash, { merchant, ref, minAmount }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) return { ok: false, error: 'txHash 格式无效' };
  let receipt;
  try {
    receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  } catch (e) {
    return { ok: false, error: '链上查询失败：' + String(e.message || e) };
  }
  if (!receipt) return { ok: false, error: '交易不存在或尚未确认，请稍候重试' };
  if (receipt.status && receipt.status !== '0x1') return { ok: false, error: '该交易在链上失败（reverted）' };

  const router = FACTS.router.toLowerCase();
  const wantMerchant = merchant.toLowerCase();
  const wantRef = ref ? ref.toLowerCase() : null;
  for (const log of receipt.logs || []) {
    if ((log.address || '').toLowerCase() !== router) continue;
    if ((log.topics?.[0] || '').toLowerCase() !== FACTS.paidTopic.toLowerCase()) continue;
    const logPayer = addrFromTopic(log.topics[1]);
    const logMerchant = addrFromTopic(log.topics[2]);
    if (logMerchant !== wantMerchant) continue;
    const data = hx(log.data || '0x');
    const assets = Number(BigInt('0x' + data.slice(0, 64))) / 1e6;
    const logRef = ('0x' + data.slice(4 * 64, 5 * 64)).toLowerCase();
    if (wantRef && logRef !== wantRef) continue;
    if (assets < minAmount * 0.98) return { ok: false, error: `支付金额 ${assets} < 订单 ${minAmount} USDC` };
    return { ok: true, amount: assets, payer: logPayer, ref: logRef };
  }
  return { ok: false, error: '未找到匹配的 Paid 事件（商户/订单号不一致）' };
}

function buildRequirement({ resource, merchant, leader, ref, amountUsdc, action, description }) {
  const assets = BigInt(Math.round(Number(amountUsdc) * 10 ** FACTS.assetDecimals));
  const approveAmount = BigInt(Math.round(Number(assets) * 1.0006)); // +0.06% 引路人费缓冲（与真实实现一致）
  const payCalldata = payData(assets, ref, merchant, leader);
  const approveCalldata = approveData(FACTS.router, approveAmount);
  return {
    x402Version: 1,
    scheme: 'exact',
    network: FACTS.eip155,
    resource,
    payTo: merchant,
    asset: 'USDC',
    amount: Number(amountUsdc),
    amountWei: assets.toString(),
    description,
    requiredCall: {
      to: FACTS.router,
      chainId: FACTS.chainId,
      method: FACTS.payMethod,
      selector: FACTS.paySelector,
      args: { assets: assets.toString(), ref, merchant, leader },
      approve: {
        to: FACTS.usdc,
        spender: FACTS.router,
        amount: approveAmount.toString(),
        calldata: approveCalldata,
      },
      payCalldata,
      note:
        '① USDC.approve(Router, amount×1.0006) → ② Router.pay(assets, ref, merchant, leader)。' +
        '广播后把 {tx, network} 以 JSON 放入 X-PAYMENT 请求头重试本请求。' +
        '该交易同时完成：商户收 USDC + 捐赠注入金库 + NAV 抬升（正和事件）。',
    },
    accepts: '将 {tx, network} 以 JSON 放入 X-PAYMENT 请求头重试',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function parseBody(request) {
  try {
    const j = await request.json();
    return j || {};
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  // 事实层环境覆盖（仅用于本地调试 / 临时切换；生产默认即上方主网常量）
  if (env?.ROUTER) FACTS.router = env.ROUTER;
  if (env?.VAULT) FACTS.vault = env.VAULT;
  if (env?.USDC) FACTS.usdc = env.USDC;

  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Payment' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const body = request.method === 'GET'
    ? Object.fromEntries(new URL(request.url).searchParams)
    : await parseBody(request);

  const xPaymentRaw = request.headers.get('X-PAYMENT') || request.headers.get('x-payment');
  const xPayment = xPaymentRaw ? (() => { try { return JSON.parse(xPaymentRaw); } catch { try { return JSON.parse(Buffer.from(xPaymentRaw, 'base64').toString('utf8')); } catch { return null; } } })() : null;

  // ── 阶段 2：带支付凭证 → 链上验付 + 解锁 ──
  if (xPayment && xPayment.tx) {
    const { host, ref, usdcAmount, action } = body;
    const verdict = await verifyPaidTx(xPayment.tx, {
      merchant: host,
      ref,
      minAmount: Number(usdcAmount) || 0,
    });
    if (!verdict.ok) return json({ ...buildRequirement({ resource: body.resource || 'live', merchant: host, leader: '0x0000000000000000000000000000000000000000', ref, amountUsdc: usdcAmount, action }), error: verdict.error }, 402);
    return json({
      ok: true,
      unlocked: action || 'consume',
      paymentConfirmed: {
        tx: xPayment.tx,
        merchant: host,
        amountUsdc: verdict.amount,
        mechanic: 'router.pay：商户收 USDC + 捐赠注入金库 + NAV 抬升（正和事件）',
      },
      note: '本特权已通过链上验付解锁。消费已驱动 LoveVault NAV 上升，全体 LOVE 持有者（同行者）增值。',
    });
  }

  // ── 阶段 1：无支付凭证 → 返回 402 支付要求 ──
  const { liveId, host, referrer, usdcAmount, action = 'consume', ref } = body;
  if (!liveId || !host || !usdcAmount || !ref) {
    return json({ error: 'liveId, host, usdcAmount, ref(bytes32) required' }, 400);
  }
  const leader = referrer && /^0x[0-9a-fA-F]{40}$/.test(referrer) ? referrer : '0x0000000000000000000000000000000000000000';
  const requirement = buildRequirement({
    resource: 'live:' + liveId + ':' + action,
    merchant: host,
    leader,
    ref,
    amountUsdc: usdcAmount,
    action,
    description: `正和直播消费: ${action} @ ${liveId}（主播 ${host}）`,
  });
  const res = new Response(JSON.stringify(requirement), { status: 402, headers: { ...headers, 'content-type': 'application/json', 'X-402': '1' } });
  return res;
}

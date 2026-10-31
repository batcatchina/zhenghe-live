// 正和 Agent 直播 · 前端逻辑
// - LiveKit 客户端（CDN ESM）进房 / 订阅
// - 正和消费：/api/live-pay 两阶段 x402（构造 402 → 钱包签名 approve+pay → 链上验付解锁）
// - 正和仪表盘：轮询 /api/live-stats 真实 NAV/TVL
import { Room, RoomEvent, Track } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.4/dist/livekit-client.esm.mjs';

const log = (m) => {
  const el = document.getElementById('log');
  el.textContent += m + '\n';
  el.scrollTop = el.scrollHeight;
};
let room = null;

// ── 进房 ──
async function join() {
  const liveId = document.getElementById('room').value.trim();
  const identity = document.getElementById('identity').value.trim();
  if (!liveId) return log('请填写直播间 ID');
  const r = await fetch(`/api/live-token?room=${encodeURIComponent(liveId)}&identity=${encodeURIComponent(identity)}&role=audience`);
  const data = await r.json();
  if (!data.token) return log('token 失败: ' + JSON.stringify(data));

  room = new Room();
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video) track.attach(document.getElementById('video'));
  });
  await room.connect(data.url, data.token);
  log(`已进入直播间 ${liveId}（${data.role}）`);
}
function leave() {
  if (room) room.disconnect();
  room = null;
  log('已离开');
}

// ── 正和消费（两阶段 x402，对齐 zhenghe-system 真实实现）──
async function consume(action, usdc) {
  const liveId = document.getElementById('room').value.trim();
  const host = document.getElementById('host').value.trim();
  if (!room) return log('请先进房');
  if (!/^0x[0-9a-fA-F]{40}$/.test(host)) return log('主播地址格式非法');
  if (!window.ethereum) return log('未检测到浏览器钱包（生产环境走 x402 facilitator 自动签名）');

  // ref = keccak256(订单号)，作为 bytes32 订单号（链上 Paid 事件用于对账）
  const orderId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const ref = globalThis.ethers.keccak256(globalThis.ethers.toUtf8Bytes(orderId));

  // 阶段 1：构造 402 支付要求
  const r1 = await fetch('/api/live-pay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ liveId, host, referrer: '', usdcAmount: usdc, action, ref }),
  });
  const req = await r1.json();
  if (!req.requiredCall) return log('支付构造失败: ' + JSON.stringify(req));

  const rc = req.requiredCall;
  log(`[${action}] 需支付 ${req.amount} USDC → router ${rc.to}`);

  const provider = window.ethereum;
  const from = (await provider.request({ method: 'eth_requestAccounts' }))[0];

  // 前置：USDC.approve(router, amount×1.0006)
  const aHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: rc.approve.to, data: rc.approve.calldata }],
  });
  log('USDC approve 已提交: ' + aHash);

  // 主交易：router.pay(assets, ref, merchant, leader)
  const pHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: rc.to, data: rc.payCalldata }],
  });
  log('router.pay 已提交: ' + pHash + ' → LoveVault NAV 将上升（正和）');

  // 阶段 2：链上验付 + 解锁
  const r2 = await fetch('/api/live-pay', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-PAYMENT': JSON.stringify({ tx: pHash, network: 'eip155:8453' }) },
    body: JSON.stringify({ liveId, host, referrer: '', usdcAmount: usdc, action, ref }),
  });
  const unlocked = await r2.json();
  log('验付解锁: ' + (unlocked.ok ? '✅ ' + JSON.stringify(unlocked.paymentConfirmed) : '❌ ' + JSON.stringify(unlocked.error)));
  if (unlocked.ok) refreshStats();
}

// ── 正和仪表盘（只读链上数据）──
async function refreshStats() {
  try {
    const r = await fetch('/api/live-stats');
    const s = await r.json();
    if (s.error) { document.getElementById('nav').textContent = '读链失败'; return; }
    document.getElementById('nav').textContent = s.nav.toFixed(6) + ' USDC';
    document.getElementById('tvl').textContent = s.totalAssetsUsdc.toFixed(2) + ' USDC';
    document.getElementById('chain').textContent = 'Base ' + s.chainId;
  } catch (e) {
    document.getElementById('nav').textContent = '网络异常';
  }
}

// ── 发现页（示例；生产从 /api/services?tag=live 拉取）──
const DEMO = [
  { id: 'demo-live-001', name: 'AI 论语共读', host: '0x227c…0001', price: '0.02' },
  { id: 'demo-live-002', name: '代码评审夜话', host: '0x8Dd1…0002', price: '0.05' },
];
function renderRooms() {
  const el = document.getElementById('rooms');
  el.innerHTML = '';
  for (const r of DEMO) {
    const div = document.createElement('div');
    div.className = 'room';
    div.innerHTML = `<div><b>${r.name}</b><br/><small>${r.host} · ${r.price} USDC/次</small></div>`;
    const b = document.createElement('button');
    b.textContent = '进入';
    b.onclick = () => {
      document.getElementById('room').value = r.id;
      document.getElementById('host').value = '0x227c0ba400000000000000000000000000000001';
      join();
    };
    div.appendChild(b);
    el.appendChild(div);
  }
}

document.getElementById('join').onclick = join;
document.getElementById('leave').onclick = leave;
document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.onclick = () => consume(btn.dataset.action, btn.dataset.usdc);
});
renderRooms();
refreshStats();
setInterval(refreshStats, 8000); // 每 8s 刷新 NAV/TVL

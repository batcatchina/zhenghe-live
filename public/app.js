// 正和 Agent 直播 · 前端逻辑
// - LiveKit 客户端（CDN ESM）
// - 进房 / 离房
// - 正和消费：调用 /api/live-pay 拿 402 支付要求 → 浏览器钱包签名提交（MVP）
import { Room, RoomEvent, Track } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.4/dist/livekit-client.esm.mjs';

const HOST = '0x227c0ba400000000000000000000000000000001'; // 示例主播地址，部署时由直播间服务动态获取
const log = (m) => {
  const el = document.getElementById('log');
  el.textContent += m + '\n';
};

let room = null;

async function join() {
  const liveId = document.getElementById('room').value.trim();
  const identity = document.getElementById('identity').value.trim();
  if (!liveId) return log('请填写直播间 ID');

  // 1) 向边缘函数申请 LiveKit token
  const r = await fetch(
    `/api/live-token?room=${encodeURIComponent(liveId)}&identity=${encodeURIComponent(identity)}&role=audience`
  );
  const data = await r.json();
  if (!data.token) return log('token 失败: ' + JSON.stringify(data));

  // 2) 连接房间
  room = new Room();
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video) {
      track.attach(document.getElementById('video'));
    }
  });
  await room.connect(data.url, data.token);
  log(`已进入直播间 ${liveId}（${data.role}）`);
}

function leave() {
  if (room) room.disconnect();
  room = null;
  log('已离开');
}

// 正和消费：构造 x402 支付并交由浏览器钱包提交
async function consume(action, usdc) {
  const liveId = document.getElementById('room').value.trim();
  if (!room) return log('请先进房');

  const res = await fetch('/api/live-pay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ liveId, host: HOST, usdcAmount: usdc, action }),
  });
  const pay = await res.json();
  if (!pay.accepts) return log('支付构造失败: ' + JSON.stringify(pay));

  const req = pay.accepts[0];
  log(`[${action}] 需支付 ${req.maxAmountRequired} USDC → router ${req.payTo}`);

  if (!window.ethereum) {
    return log('未检测到浏览器钱包。生产环境将走 x402 facilitator 自动签名。');
  }
  const provider = window.ethereum;
  const from = (await provider.request({ method: 'eth_requestAccounts' }))[0];

  // 前置：授权 USDC 给 router
  const approve = req.extra.approve;
  const aHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: approve.to, data: approve.calldata }],
  });
  log('USDC approve 已提交: ' + aHash);

  // 主交易：router.pay
  const pHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: req.to, data: req.calldata }],
  });
  log('router.pay 已提交: ' + pHash + ' → LoveVault NAV 将上升（正和）');
}

// 发现页（示例数据；生产从 /api/services?tag=live 拉取）
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

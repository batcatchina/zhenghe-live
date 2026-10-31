// 自测客户端：以「学员」身份连入本地 LiveKit，向正和老师提问，打印老师回复。
// 用法：LIVEKIT_URL=ws://localhost:7880 npm run bot -- ... 不直接用；本文件用 tsx 运行：
//   tsx bot/test-client.mjs
import {
  Room,
  RoomEvent,
} from "@livekit/rtc-node";
import { createAccessToken } from "./token.js";

const url = process.env.LIVEKIT_URL || "ws://localhost:7880";
const key = process.env.LIVEKIT_API_KEY || "devkey";
const secret = process.env.LIVEKIT_API_SECRET || "secret1234567890abcdefghijklmnopqrstuv";
const roomName = process.env.LIVEKIT_ROOM || "main";
const identity = "tester-" + Math.random().toString(36).slice(2, 7);
const enc = new TextEncoder();
const dec = (p) => new TextDecoder().decode(p);

const room = new Room();
room.on(RoomEvent.DataReceived, (payload, participant) => {
  const who = participant?.identity || "?";
  console.log(`← ${who}: ${dec(payload)}`);
});

const token = createAccessToken({
  apiKey: key,
  apiSecret: secret,
  room: roomName,
  identity,
  name: "测试学员",
  canPublish: false,
  canSubscribe: true,
  canPublishData: true,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await room.connect(url, token, { autoSubscribe: true });
console.log(`[tester] 已入房 ${roomName}（${identity}），开始提问…`);
await sleep(2000);

for (const q of ["什么是正和？", "!nav", "x402 怎么用？"]) {
  console.log(`→ 我: ${q}`);
  await room.localParticipant.publishData(enc.encode(q), { reliable: true });
  await sleep(3500);
}

await room.disconnect();
console.log("[tester] 完成，退出");
process.exit(0);

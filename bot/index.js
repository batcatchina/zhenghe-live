// 正和老师 bot · 入房主程序（基于 @livekit/rtc-node，Node 无界面 WebRTC）
//
// 职责：
//  · 以「房间成员」身份连入 LiveKit（默认房间 main），自动问候；
//  · 通过数据通道（chat）与学员互动，离线知识库 + 链上 !nav 查询 + 可选 LLM 兜底；
//  · 语音：edge-tts 合成 → 注入音频轨道（TTS 不可用时自动降级纯文字）。
//
// 运行（必填环境变量 LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET）：
//   npm run bot                              # 连 LIVEKIT_ROOM（默认 main）
//   npm run bot -- --room demo-live-001      # 指定房间
//   npm run bot -- --no-voice                # 强制纯文字
//   npm run bot:check                         # 仅校验配置与模块加载，不连网
import {
  Room,
  RoomEvent,
  ConnectionState,
} from "@livekit/rtc-node";
import { loadConfig } from "./config.js";
import { createAccessToken } from "./token.js";
import { teacherReply } from "./teacher.js";
import { Speaker } from "./voice.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
const decode = (p) => {
  try {
    return new TextDecoder().decode(p);
  } catch {
    return "";
  }
};

async function main() {
  const cfg = loadConfig();

  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    console.log("[bot] 配置校验通过：");
    console.log(
      JSON.stringify(
        {
          livekitUrl: cfg.livekitUrl ? cfg.livekitUrl.slice(0, 24) + "…" : null,
          room: cfg.room,
          identity: cfg.identity,
          name: cfg.name,
          noVoice: cfg.noVoice,
          hasRpc: !!cfg.rpcUrl,
          hasLlm: !!cfg.openaiKey,
        },
        null,
        2
      )
    );
    console.log("[bot] 模块加载 OK（token/config/vault/teacher/voice/rtc-node 均可用）");
    return;
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--room") cfg.room = args[++i] || cfg.room;
    if (args[i] === "--no-voice") cfg.noVoice = true;
  }

  if (!cfg.livekitUrl || !cfg.apiKey || !cfg.apiSecret) {
    console.error("[bot] 缺少环境变量：LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET");
    process.exit(1);
  }

  const room = new Room();
  const speaker = new Speaker(room, { voice: cfg.voice });
  let greetingDone = false;
  let connected = false;

  room.on(RoomEvent.DataReceived, (payload, participant) => {
    const text = decode(payload);
    if (!text) return;
    const from = participant?.identity || "学员";
    if (from === cfg.identity) return; // 忽略自己
    console.log(`[chat] ${from}: ${text}`);
    handleMessage(from, text).catch((e) => console.error("[chat] err", e));
  });
  room.on(RoomEvent.ParticipantConnected, (p) =>
    console.log(`[room] 新成员入房：${p.identity}`)
  );
  room.on(RoomEvent.ParticipantDisconnected, (p) =>
    console.log(`[room] 成员离开：${p.identity}`)
  );
  room.on(RoomEvent.Disconnected, () => {
    connected = false;
    console.log("[room] 已断开");
  });
  room.on(RoomEvent.ConnectionStateChanged, (s) =>
    console.log("[room] 连接状态：", s)
  );

  async function say(text) {
    if (!text) return;
    try {
      await room.localParticipant.publishData(enc.encode(text), { reliable: true });
    } catch (e) {
      console.error("[say] publishData 失败：", e.message);
    }
    if (speaker.enabled) {
      try {
        await speaker.speak(text);
      } catch (e) {
        console.error("[say] speak 失败：", e.message);
      }
    }
  }

  async function handleMessage(from, text) {
    const reply = await teacherReply(text, cfg);
    await say(`【${cfg.name}】${reply}`);
  }

  async function connectOnce() {
    const token = createAccessToken({
      apiKey: cfg.apiKey,
      apiSecret: cfg.apiSecret,
      room: cfg.room,
      identity: cfg.identity,
      name: cfg.name,
      canPublish: !cfg.noVoice,
      canSubscribe: true,
      canPublishData: true,
    });
    await room.connect(cfg.livekitUrl, token, { autoSubscribe: true });
    console.log(`[bot] 已入房「${cfg.room}」身份=${cfg.identity}（${cfg.name}）`);
    if (!cfg.noVoice) await speaker.enable();
    if (!greetingDone) {
      greetingDone = true;
      await say(cfg.greeting);
    }
    connected = true;
  }

  // 断线自动重连
  while (true) {
    try {
      if (!connected) await connectOnce();
    } catch (e) {
      console.error("[bot] 连房失败，5s 后重试：", e.message);
      await sleep(5000);
      continue;
    }
    await sleep(5000);
  }
}

main().catch((e) => {
  console.error("[bot] 致命错误：", e);
  process.exit(1);
});

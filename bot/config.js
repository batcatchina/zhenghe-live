// 环境变量配置（bot 运行时读取）。
// 必填：LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
// 可选：LIVEKIT_ROOM、BOT_IDENTITY、BOT_NAME、RPC_URL、NO_VOICE、TTS_VOICE、
//       OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL、BOT_GREETING
export function loadConfig() {
  const e = process.env;
  return {
    livekitUrl: e.LIVEKIT_URL,
    apiKey: e.LIVEKIT_API_KEY,
    apiSecret: e.LIVEKIT_API_SECRET,
    room: e.LIVEKIT_ROOM || "main",
    identity: e.BOT_IDENTITY || "ai-teacher",
    name: e.BOT_NAME || "正和老师",
    rpcUrl: e.RPC_URL || "",
    noVoice: e.NO_VOICE === "1" || e.NO_VOICE === "true",
    voice: e.TTS_VOICE || "zh-CN-XiaoxiaoNeural",
    openaiKey: e.OPENAI_API_KEY || "",
    openaiBase: e.OPENAI_BASE_URL || "https://api.openai.com/v1",
    openaiModel: e.OPENAI_MODEL || "gpt-4o-mini",
    greeting:
      e.BOT_GREETING ||
      "同学们好，我是正和老师。今天我们一起聊聊「正和」：LoveVault 是金库，LOVE 是正和资产，USDC 是稳定币，x402 是支付轨。有什么想问的，直接发到聊天框，或输入 !nav 看金库实时数据。",
    maxReplyChars: Number(e.MAX_REPLY_CHARS || 280),
  };
}

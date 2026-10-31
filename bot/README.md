# 正和老师 Bot（AI Teacher Agent）

进房即「正和 AI 老师」的 Node 服务进程：连入 LiveKit 房间，自动问候，通过**数据通道（chat）**与学员互动，支持 `!nav` 实时查链上 NAV/TVL；并通过 **edge-tts + AudioSource** 注入中文语音（TTS 不可用时自动降级纯文字）。

> 为什么是独立进程？LiveKit 的音视频是**有状态长连接**，Cloudflare Pages 是无状态短生命周期函数，无法常驻持连。所以 bot 跑在任意常驻 Node 主机（Railway / Render / Fly / VPS / 本机），前端页面独立部署在 Cloudflare Pages。

---

## 1. 前置条件

- 一个 LiveKit 服务：`LIVEKIT_URL`（如 `wss://xxx.livekit.cloud`）。
  - 最简：注册 [LiveKit Cloud](https://cloud.livekit.io/)（免费额度够用），拿到 URL + API Key/Secret。
  - 或自建：`livekit-server`（见 `livekit-local.yaml` 本地配置样例）。
- Node ≥ 18（本项目用 22 验证）。

## 2. 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `LIVEKIT_URL` | ✅ | 信令地址，如 `wss://xxx.livekit.cloud` |
| `LIVEKIT_API_KEY` | ✅ | LiveKit API Key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit API Secret |
| `LIVEKIT_ROOM` | | 目标房间名，默认 `main` |
| `BOT_IDENTITY` | | 进房身份，默认 `ai-teacher` |
| `BOT_NAME` | | 显示名，默认 `正和老师` |
| `RPC_URL` | ⚠️ 推荐 | Base 主网 RPC（Alchemy/Infura），`!nav` 查询所需 |
| `NO_VOICE` | | 设为 `1` 关闭语音（纯文字），便于无网络环境调试 |
| `TTS_VOICE` | | edge-tts 音色，默认 `zh-CN-XiaoxiaoNeural` |
| `OPENAI_API_KEY` | | 配置后启用自由对话（否则用内置知识库） |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | | 自定义兼容端点，默认 OpenAI 官方 |

## 3. 本地快速验证

仓库已带本地 LiveKit 配置，一条龙跑通：

```bash
# 终端 A：起本地 LiveKit（需要下载一次 livekit-server 二进制）
/tmp/livekit-server --config bot/livekit-local.yaml        # 监听 ws://localhost:7880

# 终端 B：起老师 bot
LIVEKIT_URL=ws://localhost:7880 \
LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=secret1234567890abcdefghijklmnopqrstuv \
LIVEKIT_ROOM=main NO_VOICE=1 \
npm run bot

# 终端 C：模拟学员提问（验证师生对话 + !nav 降级）
LIVEKIT_URL=ws://localhost:7880 LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=secret1234567890abcdefghijklmnopqrstuv \
npx tsx bot/test-client.mjs
```

预期：bot 入房并问候；学员问「什么是正和？」「x402 怎么用？」老师正确作答；`!nav` 在无 `RPC_URL` 时优雅提示配置。

语音管线冒烟测试（验证 AudioSource 注入不崩）：

```bash
npx tsx bot/voice-smoke.mjs
```

> 真实语音需要：① 不设置 `NO_VOICE`；② 运行环境能访问微软 TTS 端点（edge-tts 联网）；bot 由 `tsx` 运行以加载 edge-tts（TS 源码）。

## 4. 运行（生产）

```bash
npm install
LIVEKIT_URL=wss://你的.livekit.cloud \
LIVEKIT_API_KEY=xxx LIVEKIT_API_SECRET=yyy \
RPC_URL=https://base-mainnet.g.alchemy.com/v2/<你的key> \
npm run bot
```

`npm run bot:check` 可仅校验配置与模块加载（不连网）。

## 5. 聊天协议（与前端一致）

- 学生/老师都通过 LiveKit 数据通道发送 **UTF-8 文本**（`publishData(text, { kind: RELIABLE })`）。
- 老师回复统一前缀 `【正和老师】`，前端据此着色。
- 前端聊天面板：`public/index.html` + `public/app.js`。

## 6. 老师「大脑」

`teacher.js` 内置正和知识库（LoveVault / LOVE / USDC / x402 / ZhengHeRouter / NAV 只增不减 / 消费=可分配+共增值 / Agent 市场 / 直播场景 / Moltbook 对比 / dagent 布道等），覆盖核心问题；`!nav` 走链上读取，配置了 `OPENAI_API_KEY` 后具备自由对话兜底。

## 7. 部署

- `Dockerfile`：`docker build -t zhenghe-teacher . && docker run -e LIVEKIT_URL=... -e ... zhenghe-teacher`
- `railway.json`：Railway 一键部署（需在项目里设置上述环境变量）。

## 8. 关键文件

| 文件 | 作用 |
|---|---|
| `bot/index.js` | 入房主循环、数据通道收发、自动问候、断线重连 |
| `bot/teacher.js` | 老师大脑：知识库 + `!nav` + 可选 LLM |
| `bot/voice.js` | edge-tts → ffmpeg → AudioSource 语音注入（可降级） |
| `bot/vault.js` | 只读链上 NAV/TVL（ethers，÷1e6，不持私钥） |
| `bot/token.js` | Node crypto 签发 LiveKit token（与 Pages 函数同构） |
| `bot/config.js` | 环境变量解析 |

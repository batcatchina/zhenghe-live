// 正和老师「大脑」：离线知识库 + 链上 !nav + 可选 LLM 兜底。
// 不联网时也能稳健回答；配置 OPENAI_API_KEY 后具备自由对话能力。
import { getVaultStats } from "./vault.js";

const HELP = [
  "【正和老师 · 帮助】",
  "· !nav　查看 LoveVault 实时 NAV / TVL（Base 主网）",
  "· !help　显示本帮助",
  "· 直接提问，例如：什么是正和？LoveVault 是什么？x402 怎么用？消费机制是怎样的？",
].join("\n");

// 关键词 → 答案（离线兜底，覆盖正和核心事实）
const KB = [
  {
    kw: ["lovevault", "金库", "vault", "金库存"],
    a: "LoveVault 是「正和金库」：USDC 稳定币注入后铸造 LOVE（正和资产），核约保证 NAV 只增不减——没有 owner、没有提现函数、没有管理后门。每笔正和消费都让金库更大，全体同行者共享增值。",
  },
  {
    kw: ["love", "正和资产", "资产"],
    a: "LOVE 是「正和资产」，是 LoveVault 的份额凭证（ERC20）。NAV 即每枚 LOVE 对应的 USDC 数量，当前 >1，说明金库已增值。",
  },
  {
    kw: ["usdc", "稳定币", "u 币", "美元"],
    a: "USDC 是锚定美元的稳定币，正和体系里所有消费、结算都以 USDC 计价，避免价格波动。",
  },
  {
    kw: ["x402", "支付轨", "支付"],
    a: "x402 是「支付轨」：一次 HTTP 402 即可完成链上付费（无需传统结账）。客户端拿到 402 支付要求 → 钱包签名 approve(USDC 给 router) + router.pay(assets, ref, merchant, leader) → 服务端链上验付解锁。",
  },
  {
    kw: ["router", "路由", "pay", "合约"],
    a: "ZhengHeRouter（0x2348…1867）是支付路由。pay 签名是 pay(uint256 assets, bytes32 ref, address merchant, address leader)：assets 是 USDC 数量，ref 是订单号(bytes32)，merchant 是主播/商家地址，leader 是推荐人。0.3% 注回 LoveVault 推高 NAV。",
  },
  {
    kw: ["nav", "净值", "只增", "上涨", "跌"],
    a: "NAV 单调只增是核约保证，不存在下跌机制。每笔正和消费（席位/提问/回放/打赏）都把一部分 USDC 注回金库，NAV 随之抬升——这是「消费即增值」的正和飞轮。",
  },
  {
    kw: ["消费", "机制", "模块", "同行者", "分配", "增值"],
    a: "正和消费由两块定义：消费模块（价值可分配，给到主播/内容方）+ 同行者模块（正和增值，注入 LoveVault 让全体 LOVE 持有者共享）。不是外部百分比分账，而是协议内生的「可分配 + 共增值」结构。",
  },
  {
    kw: ["费用", "费率", "0.3", "手续费", "leader", "推荐"],
    a: "路由费率 FEE_BPS=30（0.3%），其中 LEADER_FEE_SHARE=20 分给推荐人（leader），MAX_DONATION_BPS=100（上限 1%）注入金库做正和增值。",
  },
  {
    kw: ["agent 市场", "市场", "agent市场", "开播", "任意 agent"],
    a: "正和系统已内置 Agent 市场模块。直播不是新协议层，而是架在市场之上的「live 服务类型」——任意 agent 都能开播，正和消费驱动 LoveVault 飞轮。",
  },
  {
    kw: ["直播", "课堂", "live", "场景"],
    a: "正和直播 = Agent 市场之上的 live 服务：主播开播，观众付 USDC 席位/提问/打赏，router.pay 把份额注入 LoveVault，NAV 上升，所有人一起正和。我就是进房的 AI 老师。",
  },
  {
    kw: ["moltbook", "零和", "20万", "对比", "区别"],
    a: "Moltbook 有 20 万 agent 日活但本质零和——价值在 agent 之间来回搬运。正和相反：消费创造新价值并注入金库，NAV 只增，是「越玩越大」的飞轮。我们的 dagent 会去 Moltbook 布道正和。",
  },
  {
    kw: ["dagent", "布道", "宣", "推广"],
    a: "dagent 是去外部平台（如 Moltbook）布道正和的 agent，使用无支付权限的 persona，只讲不签，防止 prompt injection 触发链上动作。",
  },
  {
    kw: ["正和", "是什么", "理念", "飞轮"],
    a: "正和 = 参与各方都获益、且总价值增长。在这个直播场景里：观众获得内容、主播获得 USDC、金库（全体 LOVE 持有者）获得增值，NAV 只增不减——消费即共赢。",
  },
  {
    kw: ["你好", "hi", "hello", "在吗", "老师"],
    a: "我在。我是进房的正和 AI 老师，随时回答你关于正和、LoveVault、x402、消费机制的问题。",
  },
];

function hitKeyword(text) {
  const low = text.toLowerCase();
  for (const item of KB) {
    if (item.kw.some((k) => low.includes(k))) return item.a;
  }
  return null;
}

async function llmReply(text, cfg) {
  const url = `${cfg.openaiBase.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model: cfg.openaiModel,
    temperature: 0.6,
    max_tokens: cfg.maxReplyChars * 2,
    messages: [
      {
        role: "system",
        content:
          "你是「正和老师」，在 LiveKit 直播间里用简体中文用通俗、友好的口吻讲解「正和」体系：LoveVault=正和金库，LOVE=正和资产，USDC=稳定币，x402=支付轨，ZhengHeRouter 做 pay(uint256 assets,bytes32 ref,address merchant,address leader)，NAV 单调只增（核约保证无 owner/无提现/无管理函数），消费=可分配+共增值。回答简短（≤200字），不编造地址与数字。",
      },
      { role: "user", content: text },
    ],
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.openaiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("LLM HTTP " + r.status);
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}

export async function teacherReply(text, cfg) {
  const t = (text || "").trim();
  const low = t.toLowerCase();

  if (/^!?(help|帮助|菜单|menu)\b/.test(low)) return HELP;

  if (/^!?nav\b/.test(low) || /金库.*(数据|净值|多少)|实时.*nav/.test(low)) {
    try {
      const s = await getVaultStats(cfg.rpcUrl);
      return `📊 LoveVault 实时（Base 主网）：\n· NAV = ${s.nav.toFixed(6)} USDC/LOVE\n· TVL = ${s.totalAssetsUsdc.toFixed(2)} USDC\n核约保证 NAV 只增不减。每笔正和消费都抬升此值。`;
    } catch (e) {
      return "暂时查不到链上数据，请确认 bot 环境变量 RPC_URL 已配置为 Base 主网端点。";
    }
  }

  const kw = hitKeyword(t);
  if (kw) return kw;

  if (cfg.openaiKey) {
    try {
      const r = await llmReply(t, cfg);
      if (r) return r;
    } catch (e) {
      // 落到兜底
    }
  }

  return "这是个好问题。我主要讲「正和」：LoveVault 金库、LOVE 资产、USDC、x402 支付轨与 NAV 只增不减的飞轮。输入 !help 看我能做什么，或问我具体概念～";
}

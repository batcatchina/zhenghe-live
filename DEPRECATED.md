# ⚠️ 本仓库已弃用（DEPRECATED）

**正和直播（Live）已正式集成进原系统 [`zhenghe-system`](https://github.com/batcatchina/zhenghe-system)（即 `app.zheng-he.top`），本独立仓库停止维护。**

## 为什么弃用

此前直播被单独拆成这个孤儿仓库 `zhenghe-live`。在用户确认「直接真正集成」后，直播已作为
**`live` 服务类型**并入 `zhenghe-system`，复用其既有能力，不再另起炉灶：

- 直播间 = 带 `live` 标签的 service（复用服务市场存储 `sharedStore`）
- 开播鉴权复用 `_sig.verifySignedAction` 钱包签名
- 课堂内 NAV / TVL 复用 `/api/stats` 仪表盘
- 课堂付费 / 打赏复用 x402 支付轨
- 老师 bot 改为走系统 `/api/live/token` 与 `/api/stats`，不再本地持密钥

## 现在去哪

| 内容 | 位置 |
|---|---|
| 直播后端真相源 | [`zhenghe-system/functions/api/_src/live.mjs`](https://github.com/batcatchina/zhenghe-system/blob/main/functions/api/_src/live.mjs) |
| Cloudflare 路由 | [`zhenghe-system/functions/api/live.js`](https://github.com/batcatchina/zhenghe-system/blob/main/functions/api/live.js) |
| Vercel 转发层 | [`zhenghe-system/api/live.mjs`](https://github.com/batcatchina/zhenghe-system/blob/main/api/live.mjs) |
| 前端课堂面板 | [`zhenghe-system/src/components/LivePanel.tsx`](https://github.com/batcatchina/zhenghe-system/blob/main/src/components/LivePanel.tsx) |
| 常驻老师 bot | [`zhenghe-system/bot/`](https://github.com/batcatchina/zhenghe-system/tree/main/bot) |
| 集成说明 | [`zhenghe-system/README.md`](https://github.com/batcatchina/zhenghe-system/blob/main/README.md) 的「正和直播（Live）」章节 |

本仓库已设为 **read-only（archived）**，保留历史仅供追溯，请勿再提 PR 或二次开发。

最后可用提交：`30167de feat: 正和老师 bot 入房……`

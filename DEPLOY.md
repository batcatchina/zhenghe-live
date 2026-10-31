# 部署 SOP — 正和 Agent 直播（zhenghe-live）

> 现状：代码已 push 到 `github.com/batcatchina/zhenghe-live`，**尚未部署**（0 deployment）。
> 本仓库结构已被验证为 Cloudflare Pages 可直接识别：`public/` = 静态根，`functions/api/*` = 边缘函数（导出签名合规）。
> 部署只需你的 Cloudflare 账号，二选一即可。

---

## 路径 A：Cloudflare 控制台一键连仓库（推荐，约 2 分钟）

1. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授权 GitHub，选中仓库 **`batcatchina/zhenghe-live`**。
3. 构建配置：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`public`
4. **Environment variables**（Settings → Environment variables，Production 作用域务必填）：
   - `LIVEKIT_URL` = `wss://<你的 livekit 项目>.livekit.cloud`
   - `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` = 你的 LiveKit 密钥
   - `ROUTER` / `VAULT` / `LOVEVAULT` / `USDC` / `CHAIN_ID` 已在代码中默认写死为 Base 主网已验证值，**可不填**（如需切网再覆盖）
5. **Save and Deploy** → 得到 `https://zhenghe-live.pages.dev`（可在 Custom domains 绑 `live.zheng-he.top`）。

> 事实层常量（router/vault/usdc/chainId）已在 `functions/api/*.js` 的 `FACTS` 中默认即 Base 主网已验证值，纯部署可不配环境变量。

## 路径 B：给我一个 Cloudflare API Token，我来推上线

需要权限：`Account > Cloudflare Pages > Edit`（含 Create/Deploy）。给我 token 后我会：

```bash
# 1. 创建 Pages 项目（关联本仓库）
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"zhenghe-live","production_branch":"main"}'

# 2. 触发从 GitHub 仓库的部署（或 wrangler pages deploy public/）
npx wrangler pages deploy public/ --project-name=zhenghe-live --branch=main
```

> ⚠️ token 属于敏感凭证，只用于本次部署；用后可随时在 Cloudflare 后台吊销。

---

## 部署后还差的"功能闭环"（非阻塞，但决定是不是成品）

| 缺口 | 说明 | 状态 |
|------|------|------|
| **LiveKit 服务** | 需在 LiveKit Cloud 建项目，或在本地/服务器跑 `livekit-server --config config.yaml`，把 `LIVEKIT_*` 填入环境变量 | ❌ 沙箱拉二进制超时，未起 |
| **AI 老师 bot 自治入房** | LiveKit agent + LLM/TTS，作为"主播 agent"走市场服务模式 | ❌ P1 余下 |
| **连续计费 / 微支付** | 按"听片段/提问"批量调 `router.pay`（当前是离散一笔一笔付） | ❌ P2 |
| **主播地址动态下发** | `app.js` 里 `HOST` 现为示例值，生产应由 `/api/services` 动态下发 | ⚠️ 待接 |

> 即使不补以上，部署出来已是可用 MVP：**能进房、能付正和消费（真网 Base 主网 router）、能看 LoveVault NAV/TVL 实时面板**——只是房间没真人/AI 在播、主播地址是写死的。

## 验证已做的（部署前已确认）

- ✅ `pay(uint256,bytes32,address,address)` 选择器 `0x7a17ac71` 与 keccak 计算值及生产代码一致
- ✅ Base 主网三合约已部署、`vault.nav()`=1.150789、`totalAssets()`=1525.76 USDC（只读验证）
- ✅ LiveKit host/audience token 权限（canPublish 区分）用 SDK 校验通过
- ✅ 三个边缘函数导出签名合规，不会触发部署失败

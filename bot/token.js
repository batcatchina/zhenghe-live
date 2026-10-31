// 生成 LiveKit 进房 access token（HS256）。
// 与 functions/api/live-token.js 完全同构，但用 Node crypto（bot 跑在 Node 运行时）。
// 服务端用 API Key/Secret 直接签发，无需走 HTTP。
import crypto from "node:crypto";

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

export function createAccessToken({
  apiKey,
  apiSecret,
  room,
  identity,
  name,
  canPublish = true,
  canSubscribe = true,
  canPublishData = true,
  ttlSeconds = 3600,
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const video = { room, roomJoin: true, canPublish, canSubscribe, canPublishData };
  const payload = {
    iss: apiKey,
    sub: identity,
    nbf: now,
    iat: now,
    exp: now + ttlSeconds,
    name: name || identity,
    video,
  };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.createHmac("sha256", apiSecret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

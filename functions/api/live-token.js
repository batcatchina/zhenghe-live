// LiveKit 进房 token —— 自包含 HS256 JWT 实现，零外部依赖（Cloudflare Workers 原生 Web Crypto）。
// token 格式与 livekit-server-sdk 完全兼容（header.alg=HS256，payload 含 iss/sub/video 授权）。
// GET /api/live-token?room=xxx&identity=xxx&role=host|audience

const enc = new TextEncoder();

function b64(input) {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64url(input) {
  return b64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSign(secret, dataStr) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataStr));
  return b64url(new Uint8Array(sig));
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") || "main";
  const identity =
    url.searchParams.get("identity") || "u-" + Math.random().toString(36).slice(2, 8);
  const role = url.searchParams.get("role") || "audience";
  const apiKey = env.LIVEKIT_API_KEY || "devkey";
  const apiSecret =
    env.LIVEKIT_API_SECRET || "secret1234567890abcdefghijklmnop";

  const isHost = role === "host";
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const grant = {
    room,
    roomJoin: true,
    canPublish: isHost,
    canSubscribe: true,
    canPublishData: true, // 观众也能发聊天数据（与正和老师对话）
  };
  const payload = {
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: now + 3600,
    video: grant,
  };

  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const data = headerB64 + "." + payloadB64;
  const sig = await hmacSign(apiSecret, data);
  const token = data + "." + sig;

  return new Response(
    JSON.stringify({ token, room, identity, role, grant }),
    {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    }
  );
}

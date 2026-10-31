// Cloudflare Pages Function · 为进房者签发 LiveKit join token
// GET /api/live-token?room=<liveId>&identity=<id>&role=host|audience
import { AccessToken } from 'livekit-server-sdk';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const room = url.searchParams.get('room');
  if (!room) return json({ error: 'room required' }, 400);

  const identity =
    url.searchParams.get('identity') ||
    'anon-' + Math.random().toString(36).slice(2, 10);
  const role = url.searchParams.get('role') || 'audience';

  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return json({ error: 'LiveKit 未配置 (LIVEKIT_API_KEY/SECRET)' }, 500);
  }

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity,
    name: identity,
    ttl: 60 * 60,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: role === 'host', // 主播可发流，观众仅订阅
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return json({ token, url: env.LIVEKIT_URL, room, role });
}

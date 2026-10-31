// 语音管线冒烟测试：发布 AudioSource 音频轨道并推若干合成帧，证明注入管线可用（不依赖 TTS 网络）。
import { Room, RoomEvent, AudioSource, AudioFrame, LocalAudioTrack, TrackSource } from "@livekit/rtc-node";
import { createAccessToken } from "./token.js";

const url = "ws://localhost:7880";
const key = "devkey";
const secret = "secret1234567890abcdefghijklmnopqrstuv";
const room = new Room();
room.on(RoomEvent.ConnectionStateChanged, (s) => console.log("state", s));

const token = createAccessToken({ apiKey: key, apiSecret: secret, room: "main", identity: "vt", name: "vt", canPublish: true, canSubscribe: true, canPublishData: true });
await room.connect(url, token, { autoSubscribe: true });

const SR = 48000, CH = 1;
const source = new AudioSource(SR, CH);
const track = LocalAudioTrack.createAudioTrack("vt-audio", source);
await room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_MIC });
console.log("audio track published:", !!track);

// 推 30 帧合成正弦（约 0.6s）
for (let i = 0; i < 30; i++) {
  const n = 960;
  const data = new Int16Array(n);
  for (let j = 0; j < n; j++) data[j] = Math.round(3000 * Math.sin((i * n + j) / 20));
  await source.captureFrame(new AudioFrame(data, SR, CH, n));
}
console.log("pushed 30 synthetic frames OK");
await room.disconnect();
console.log("VOICE PIPELINE OK");
process.exit(0);

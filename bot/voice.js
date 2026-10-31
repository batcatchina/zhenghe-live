// 语音模块（@livekit/rtc-node 原生 AudioSource 注入，Node 无界面可用）。
// 流程：edge-tts 合成中文语音(MP3) → ffmpeg 解码为 s16le PCM → 分帧 captureFrame 注入音频轨道。
// TTS/网络不可用时自动降级纯文字（轨道已发布但静音），bot 仍正常入房、互动。
import { spawn } from "node:child_process";
import { AudioSource, AudioFrame, LocalAudioTrack, TrackSource } from "@livekit/rtc-node";

export class Speaker {
  constructor(room, { voice = "zh-CN-XiaoxiaoNeural", sampleRate = 48000 } = {}) {
    this.room = room;
    this.voice = voice;
    this.sampleRate = sampleRate;
    this.channels = 1;
    this.enabled = false;
    this.source = null;
  }

  async enable() {
    try {
      this.source = new AudioSource(this.sampleRate, this.channels);
      const track = LocalAudioTrack.createAudioTrack("teacher-audio", this.source);
      await this.room.localParticipant.publishTrack(track, {
        source: TrackSource.SOURCE_MIC,
      });
      this.enabled = true;
      console.log("[voice] 音频轨道已发布，语音就绪");
      return true;
    } catch (e) {
      console.warn("[voice] 启用失败，降级纯文字：", e.message);
      return false;
    }
  }

  // 合成并播放一段语音。返回是否成功播音。
  async speak(text) {
    if (!this.enabled) return false;
    let pcm;
    try {
      const mp3 = await this._tts(String(text).slice(0, 400));
      pcm = await mp3ToPcm(mp3, this.sampleRate, this.channels);
    } catch (e) {
      console.warn("[voice] TTS 失败，本条仅文字：", e.message);
      return false;
    }
    const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const per = 960 * this.channels; // 20ms @ 48k
    for (let off = 0; off < int16.length; off += per) {
      const end = Math.min(off + per, int16.length);
      const frame = new AudioFrame(
        int16.subarray(off, end),
        this.sampleRate,
        this.channels,
        (end - off) / this.channels
      );
      await this.source.captureFrame(frame); // captureFrame 内部按实时节奏背压
    }
    return true;
  }

  async _tts(text) {
    const mod = await import("edge-tts").catch(() => null);
    const Communicate = mod?.Communicate || mod?.default?.Communicate;
    if (!Communicate) throw new Error("edge-tts 不可用");
    const c = new Communicate(text, this.voice);
    const chunks = [];
    for await (const chunk of c.stream()) {
      if (chunk.type === "audio" && chunk.data) chunks.push(Buffer.from(chunk.data));
    }
    if (!chunks.length) throw new Error("TTS 返回空");
    return Buffer.concat(chunks);
  }
}

function mp3ToPcm(mp3, sr, ch) {
  return new Promise((resolve, reject) => {
    const f = spawn("ffmpeg", [
      "-i", "pipe:0", "-f", "s16le", "-acodec", "pcm_s16le",
      "-ar", String(sr), "-ac", String(ch), "pipe:1", "-loglevel", "error",
    ]);
    const chunks = [];
    const errs = [];
    f.stdout.on("data", (d) => chunks.push(d));
    f.stderr.on("data", (d) => errs.push(d));
    f.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error("ffmpeg exit " + code + ": " + Buffer.concat(errs).toString()));
    });
    f.stdin.write(mp3);
    f.stdin.end();
  });
}

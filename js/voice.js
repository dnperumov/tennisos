// Realtime voice session over WebRTC. Mic audio goes straight to OpenAI;
// tool calls come back on the data channel and run locally.
import { runTool } from "./actions.js";
import { getState, today } from "./store.js";

export function createVoice({ onMode, onTranscript, onChange, onError }) {
  let pc = null, dc = null, mic = null, audioEl = null, ctx = null;
  let inAn = null, outAn = null;
  const buf = new Float32Array(1024);
  let muted = false;
  const pending = new Set(); // call_ids executed in the current response

  const level = (an) => {
    if (!an) return 0;
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  function send(ev) { if (dc?.readyState === "open") dc.send(JSON.stringify(ev)); }

  async function start() {
    onMode("connecting");
    try {
      const tokenRes = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: getState(), today: today() }),
      });
      const token = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !token.client_secret) throw new Error(token.error || "Couldn't start a voice session.");

      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      inAn = ctx.createAnalyser(); inAn.fftSize = 2048;
      ctx.createMediaStreamSource(mic).connect(inAn);

      pc = new RTCPeerConnection();
      audioEl = new Audio(); audioEl.autoplay = true;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        outAn = ctx.createAnalyser(); outAn.fftSize = 2048;
        ctx.createMediaStreamSource(e.streams[0]).connect(outAn);
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc?.connectionState)) { onError("Voice connection dropped. Tap the ball to reconnect."); stop(); }
      };
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch {} };
      dc.onopen = () => onMode("listening");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token.client_secret}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error(`OpenAI refused the voice connection (${sdpRes.status}).`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
      if (ctx.state === "suspended") await ctx.resume();
    } catch (e) {
      const msg = e?.name === "NotAllowedError" ? "Microphone access is blocked. Allow it in your browser settings, then tap the ball." : e.message || String(e);
      onError(msg);
      stop();
    }
  }

  function stop() {
    try { dc?.close(); } catch {}
    try { pc?.getSenders().forEach((s) => s.track?.stop()); pc?.close(); } catch {}
    mic?.getTracks().forEach((t) => t.stop());
    try { ctx?.close(); } catch {}
    if (audioEl) audioEl.srcObject = null;
    pc = dc = mic = ctx = inAn = outAn = null;
    muted = false;
    onMode("idle");
  }

  function handle(ev) {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        onMode("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        onMode("thinking");
        break;
      case "conversation.item.input_audio_transcription.delta":
        onTranscript({ role: "user", id: ev.item_id, delta: ev.delta });
        break;
      case "conversation.item.input_audio_transcription.completed":
        onTranscript({ role: "user", id: ev.item_id, text: ev.transcript, final: true });
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        onMode("speaking");
        onTranscript({ role: "coach", id: ev.item_id, delta: ev.delta });
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        onTranscript({ role: "coach", id: ev.item_id, text: ev.transcript, final: true });
        break;
      case "output_audio_buffer.started":
        onMode("speaking");
        break;
      case "output_audio_buffer.stopped":
        onMode("listening");
        break;
      case "response.function_call_arguments.done":
        runCall(ev.call_id, ev.name, ev.arguments);
        break;
      case "response.done": {
        // Catch any function calls not delivered via the args.done event.
        for (const item of ev.response?.output || []) {
          if (item.type === "function_call") runCall(item.call_id, item.name, item.arguments);
        }
        if (pending.size) { pending.clear(); send({ type: "response.create" }); }
        if (ev.response?.status === "failed") onError(ev.response?.status_details?.error?.message || "The coach hit an error on that turn.");
        break;
      }
      case "error":
        onError(ev.error?.message || "Voice session error.");
        break;
    }
  }

  const done = new Set();
  function runCall(callId, name, args) {
    if (!callId || done.has(callId)) return;
    done.add(callId);
    pending.add(callId);
    onMode("thinking");
    const { output, change } = runTool(name, args);
    if (change) onChange(change);
    send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } });
  }

  return {
    start, stop,
    get active() { return !!pc; },
    levels: () => ({ input: muted ? 0 : level(inAn), output: level(outAn) }),
    toggleMute() {
      muted = !muted;
      mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
      return muted;
    },
    sendText(text) {
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
      send({ type: "response.create" });
    },
    // Keeps the coach's picture of the data current after manual edits.
    refreshContext() {
      send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: "The player edited the workspace by hand. Current state: " + JSON.stringify(getState()) }] } });
    },
  };
}

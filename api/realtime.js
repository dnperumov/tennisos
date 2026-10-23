// Mints a short-lived Realtime client secret so the browser can open a
// WebRTC voice session directly with OpenAI. The API key never leaves the server.
import { REALTIME_TOOLS } from "./_tools.js";
import { buildInstructions, readJson } from "./_prompt.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "Voice needs OPENAI_API_KEY set in Vercel." });

  const body = readJson(req);
  if (JSON.stringify(body).length > 120_000) return res.status(413).json({ error: "Workspace is too large to send." });

  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
  const session = {
    type: "realtime",
    model,
    instructions: buildInstructions({ workspace: body.workspace, today: body.today, mode: "voice" }),
    tools: REALTIME_TOOLS,
    tool_choice: "auto",
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        noise_reduction: { type: "far_field" },
        // Low eagerness: waits through pauses so long reflections aren't cut off.
        turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true },
      },
      output: { voice: process.env.OPENAI_VOICE || "marin" },
    },
  };

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 600 }, session }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(502).json({ error: data?.error?.message || `OpenAI returned ${r.status}.` });
    }
    return res.status(200).json({ client_secret: data.value, expires_at: data.expires_at, model });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach OpenAI. Check the network and try again." });
  }
}

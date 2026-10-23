// Text coach. Thin proxy over the Responses API: adds instructions + tools,
// returns the model's output items. The browser runs any tool calls against
// local data and posts the results back with previous_response_id.
import { RESPONSES_TOOLS } from "./_tools.js";
import { buildInstructions, readJson } from "./_prompt.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: "Typed coaching needs OPENAI_API_KEY set in Vercel." });

  const body = readJson(req);
  const { message, tool_outputs, previous_response_id, workspace, today } = body;
  if (JSON.stringify(body).length > 150_000) return res.status(413).json({ error: "Request is too large." });

  let input;
  if (Array.isArray(tool_outputs) && tool_outputs.length) {
    input = tool_outputs.map((o) => ({ type: "function_call_output", call_id: String(o.call_id), output: String(o.output) }));
  } else if (typeof message === "string" && message.trim() && message.length <= 8000) {
    input = [{ role: "user", content: message.trim() }];
  } else {
    return res.status(400).json({ error: "Write a message (up to 8,000 characters)." });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
        instructions: buildInstructions({ workspace, today, mode: "text" }),
        input,
        tools: RESPONSES_TOOLS,
        previous_response_id: typeof previous_response_id === "string" ? previous_response_id : undefined,
        store: true,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || `OpenAI returned ${r.status}.` });

    const calls = [];
    let text = "";
    for (const item of data.output || []) {
      if (item.type === "function_call") calls.push({ call_id: item.call_id, name: item.name, arguments: item.arguments });
      if (item.type === "message") for (const c of item.content || []) if (c.type === "output_text") text += c.text;
    }
    return res.status(200).json({ id: data.id, text, calls });
  } catch {
    return res.status(502).json({ error: "Couldn't reach OpenAI. Check the network and try again." });
  }
}

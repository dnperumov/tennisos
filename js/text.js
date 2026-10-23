// Typed coaching when voice isn't running. Loops until the model stops calling tools.
import { runTool } from "./actions.js";
import { getState, today } from "./store.js";

let previousId = null;

async function post(payload) {
  const r = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, previous_response_id: previousId, workspace: getState(), today: today() }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `The coach didn't respond (${r.status}).`);
  previousId = data.id;
  return data;
}

export async function askCoach(message, onChange) {
  let data = await post({ message });
  let text = data.text || "";
  for (let i = 0; i < 6 && data.calls?.length; i++) {
    const tool_outputs = data.calls.map((c) => {
      const { output, change } = runTool(c.name, c.arguments);
      if (change) onChange(change);
      return { call_id: c.call_id, output };
    });
    data = await post({ tool_outputs });
    text = [text, data.text].filter(Boolean).join("\n\n");
  }
  return text;
}

export function resetThread() { previousId = null; }

// Executes coach tool calls against the local workspace.
// Returns { output: string for the model, change: {label, screen, id} | null }.
import { getState, update, uid, today } from "./store.js";
import { parseScore } from "./score.js";

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function patch(target, fields) {
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) target[k] = v;
}

const handlers = {
  log_match(a) {
    const opponent = str(a.opponent);
    const score = str(a.score);
    if (!opponent || !score) return fail("Need the opponent and the score before logging a match.");
    if (!parseScore(score).length) return fail(`Couldn't read the score "${score}". Use a format like 6-4 3-6 [10-7].`);
    if (a.result !== "W" && a.result !== "L") return fail("Need to know whether he won or lost.");
    const m = {
      id: uid("m"), date: isDate(a.date) ? a.date : null, opponent,
      opponent_country: str(a.opponent_country), opponent_utr: num(a.opponent_utr),
      score, result: a.result, event: str(a.event), surface: str(a.surface), summary: str(a.summary), created: new Date().toISOString(),
    };
    update((s) => s.matches.push(m));
    return ok({ id: m.id }, { label: `${m.result === "W" ? "Win" : "Loss"} vs ${opponent} logged`, screen: "matches", id: m.id });
  },

  update_match(a) {
    const m = getState().matches.find((x) => x.id === a.id);
    if (!m) return fail(`No match with id ${a.id}.`);
    if (str(a.score) && !parseScore(a.score).length) return fail(`Couldn't read the score "${a.score}".`);
    update(() =>
      patch(m, {
        date: isDate(a.date) ? a.date : null, opponent: str(a.opponent), opponent_country: str(a.opponent_country),
        opponent_utr: num(a.opponent_utr), score: str(a.score), result: a.result === "W" || a.result === "L" ? a.result : null,
        event: str(a.event), surface: str(a.surface), summary: str(a.summary),
      })
    );
    return ok({ id: m.id }, { label: `Match vs ${m.opponent} updated`, screen: "matches", id: m.id });
  },

  add_note(a) {
    const text = str(a.text);
    if (!text) return fail("Note text is empty.");
    const matchId = str(a.match_id);
    if (matchId && !getState().matches.some((m) => m.id === matchId)) return fail(`No match with id ${matchId}.`);
    const kinds = ["match", "practice", "tactics", "mindset", "fitness"];
    const n = { id: uid("n"), kind: kinds.includes(a.kind) ? a.kind : "practice", text, date: isDate(a.date) ? a.date : today(), match_id: matchId, created: new Date().toISOString() };
    update((s) => s.notes.push(n));
    return ok({ id: n.id }, { label: `${cap(n.kind)} note saved`, screen: "notes", id: n.id });
  },

  set_focus_area(a) {
    const s = getState();
    const fields = {
      title: str(a.title), why: str(a.why), cue: str(a.cue),
      drills: Array.isArray(a.drills) ? a.drills.map(str).filter(Boolean) : null,
      priority: ["now", "next", "later"].includes(a.priority) ? a.priority : null,
      status: ["working", "improving", "solid"].includes(a.status) ? a.status : null,
      evidence: ["observed", "hypothesis"].includes(a.evidence) ? a.evidence : null,
    };
    const progress = str(a.progress_note);
    if (str(a.id)) {
      const f = s.focus.find((x) => x.id === a.id);
      if (!f) return fail(`No focus area with id ${a.id}.`);
      update(() => {
        patch(f, fields);
        if (progress) f.progress.unshift({ date: today(), text: progress });
        f.updated = today();
      });
      return ok({ id: f.id }, { label: `${f.title} updated`, screen: "focus", id: f.id });
    }
    if (!fields.title) return fail("A new focus area needs a title.");
    const f = {
      id: uid("f"), title: fields.title, why: fields.why, cue: fields.cue, drills: fields.drills || [],
      priority: fields.priority || "next", status: fields.status || "working", evidence: fields.evidence || "hypothesis",
      progress: progress ? [{ date: today(), text: progress }] : [], updated: today(),
    };
    update((st) => st.focus.push(f));
    return ok({ id: f.id }, { label: `New focus: ${f.title}`, screen: "focus", id: f.id });
  },

  delete_item(a) {
    const coll = getState()[a.collection];
    if (!Array.isArray(coll)) return fail("Unknown collection.");
    const item = coll.find((x) => x.id === a.id);
    if (!item) return fail(`Nothing with id ${a.id} in ${a.collection}.`);
    update((s) => {
      s[a.collection] = s[a.collection].filter((x) => x.id !== a.id);
      if (a.collection === "matches") s.notes.forEach((n) => { if (n.match_id === a.id) n.match_id = null; });
    });
    const what = item.title || (item.opponent ? `match vs ${item.opponent}` : "note");
    return ok({ deleted: a.id }, { label: `Deleted ${what}`, screen: a.collection === "focus" ? "focus" : a.collection, id: null });
  },

  update_profile(a) {
    update((s) => patch(s.profile, {
      goal: str(a.goal), utr: num(a.utr), cue: str(a.cue),
      strengths: Array.isArray(a.strengths) ? a.strengths.map(str).filter(Boolean) : null,
    }));
    return ok({}, { label: "Profile updated", screen: "focus", id: null });
  },

  get_workspace() {
    return { output: JSON.stringify(getState()), change: null };
  },
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ok = (data, change) => ({ output: JSON.stringify({ ok: true, ...data }), change });
const fail = (error) => ({ output: JSON.stringify({ ok: false, error }), change: null });

export function runTool(name, rawArgs) {
  let args = rawArgs;
  if (typeof rawArgs === "string") {
    try { args = JSON.parse(rawArgs || "{}"); } catch { return fail("Arguments weren't valid JSON."); }
  }
  const h = handlers[name];
  if (!h) return fail(`Unknown tool ${name}.`);
  try { return h(args || {}); } catch (e) { return fail(String(e.message || e)); }
}

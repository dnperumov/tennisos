// Local-first workspace: everything lives in this browser's localStorage.
// ?demo runs against a throwaway copy so demo data never touches the real journal.
const KEY = new URLSearchParams(location.search).has("demo") ? "tennisos.demo.v2" : "tennisos.workspace.v2";

export const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export function today() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function seed() {
  const t = today();
  return {
    version: 2,
    profile: {
      goal: "UTR 12–13 and ITF Futures",
      utr: null,
      strengths: ["Forehand variety and heavy ball", "Big serve", "Baseline consistency"],
      cue: "Early feet. Free swing. Big target.",
    },
    matches: [
      {
        id: "m_brazil", date: "2026-10-23", opponent: "Brazilian opponent", opponent_country: "Brazil", opponent_utr: null,
        score: "2-4 4-2 [7-10]", result: "L", event: null, surface: null,
        summary: "Dropped the first set, levelled the second, lost the match tiebreak. Name and UTR unknown.", created: t,
      },
      {
        id: "m_tessa", date: null, opponent: "Louis Tessa", opponent_country: "France", opponent_utr: 13.2,
        score: "4-5 4-5", result: "L", event: null, surface: null,
        summary: "Opponent UTR 13.2 as reported.", created: t,
      },
    ],
    notes: [],
    focus: [
      { id: "f_pressure", title: "Playing big points freely", why: "Fear of missing on pressure points.", drills: [], cue: "Early feet. Free swing. Big target.", priority: "now", status: "working", evidence: "observed", progress: [], updated: t },
      { id: "f_serveplus1", title: "Serve and serve-plus-one", why: null, drills: [], cue: null, priority: "now", status: "working", evidence: "observed", progress: [], updated: t },
      { id: "f_bh_spacing", title: "Backhand contact spacing", why: "Spacing to the ball on neutral and short two-handed backhands.", drills: [], cue: null, priority: "now", status: "working", evidence: "observed", progress: [], updated: t },
      { id: "f_forward", title: "Stepping in on short balls", why: "Confidence moving forward and attacking short balls.", drills: [], cue: null, priority: "next", status: "working", evidence: "observed", progress: [], updated: t },
      { id: "f_recovery", title: "Recovery depth matches shot quality", why: "Recovery position and depth should match the quality of the shot just hit.", drills: [], cue: null, priority: "next", status: "working", evidence: "observed", progress: [], updated: t },
      { id: "f_heavy", title: "Heavy ball with accuracy, every rally", why: null, drills: [], cue: null, priority: "later", status: "working", evidence: "observed", progress: [], updated: t },
    ],
  };
}

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = JSON.parse(raw);
      if (ws && ws.version === 2) return ws;
    }
  } catch {}
  return seed();
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export const getState = () => state;

export function update(fn) {
  fn(state);
  sortAll();
  persist();
  subs.forEach((s) => s(state));
}

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

export function replaceAll(ws) {
  if (!ws || ws.version !== 2 || !Array.isArray(ws.matches)) throw new Error("That file isn't a TennisOS backup.");
  state = ws;
  update(() => {});
}

function sortAll() {
  const byDate = (a, b) => (b.date || "0000").localeCompare(a.date || "0000") || (b.created || "").localeCompare(a.created || "");
  state.matches.sort(byDate);
  state.notes.sort(byDate);
  const pr = { now: 0, next: 1, later: 2 };
  state.focus.sort((a, b) => (pr[a.priority] ?? 3) - (pr[b.priority] ?? 3));
}

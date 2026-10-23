import { getState, update, subscribe, replaceAll, uid, today } from "./store.js";
import { parseScore } from "./score.js";
import { runTool } from "./actions.js";
import { createOrb } from "./orb.js";
import { createVoice } from "./voice.js";
import { askCoach } from "./text.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (d, opts = { weekday: "short", month: "short", day: "numeric" }) => {
  if (!d) return "Date not set";
  const dt = new Date(d + "T12:00:00");
  const o = { ...opts };
  if (dt.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return dt.toLocaleDateString(undefined, o);
};
const DEMO = new URLSearchParams(location.search).has("demo");

/* ---------------- Tabs ---------------- */
let current = "coach";
function show(tab, focusId) {
  current = tab;
  document.querySelectorAll("[data-screen]").forEach((el) => (el.hidden = el.dataset.screen !== tab));
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.toggleAttribute("aria-current", b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.querySelector(".dot")?.setAttribute("hidden", "");
  });
  if (location.hash.slice(1) !== tab) history.replaceState(null, "", tab === "coach" ? location.pathname + location.search : "#" + tab);
  if (focusId) requestAnimationFrame(() => highlight(focusId));
  else window.scrollTo({ top: 0 });
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
addEventListener("hashchange", () => show(location.hash.slice(1) || "coach"));

function highlight(id) {
  const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  if (el.classList.contains("match")) openMatches.add(id), renderMatches(), highlight2(id);
  else highlight2(id);
}
function highlight2(id) {
  const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.classList.remove("fresh"); void el.offsetWidth; el.classList.add("fresh");
}

/* ---------------- Matches ---------------- */
const openMatches = new Set();
function scoreboard(m) {
  const sets = parseScore(m.score);
  const cells = (mine) =>
    sets.map((s) => {
      const me = mine ? s.a : s.b, them = mine ? s.b : s.a;
      const won = me > them;
      const sup = s.tb != null && !won ? `<sup>${s.tb}</sup>` : "";
      return `<span class="${won ? "won" : ""} ${s.mtb ? "mtb" : ""}">${me}${sup}</span>`;
    }).join("");
  const opp = `${esc(m.opponent)}${m.opponent_utr != null ? `<small>${esc(m.opponent_utr)}</small>` : ""}`;
  return `<div class="board" aria-label="Score ${esc(m.score)}">
      <span class="who ${m.result === "L" ? "lost" : ""}">You</span><span class="sets">${cells(true)}</span>
      <span class="who ${m.result === "W" ? "lost" : ""}">${opp}</span><span class="sets">${cells(false)}</span>
    </div>`;
}

function renderMatches() {
  const { matches, notes } = getState();
  const w = matches.filter((m) => m.result === "W").length;
  $("#record").innerHTML = matches.length ? `<b>${w}</b>–<b>${matches.length - w}</b>` : "";
  $("#record").setAttribute("aria-label", `Record ${w} wins, ${matches.length - w} losses`);
  if (!matches.length) {
    $("#matchList").innerHTML = `<li class="empty">No matches yet. Tell the coach how your last one went and it'll show up here.<br><button data-go="coach">Talk to the coach</button></li>`;
    return;
  }
  $("#matchList").innerHTML = matches.map((m) => {
    const open = openMatches.has(m.id);
    const linked = notes.filter((n) => n.match_id === m.id);
    return `<li class="match" data-id="${m.id}">
      <button class="match-head" aria-expanded="${open}" data-toggle="${m.id}">
        <span class="match-meta"><span>${esc(fmtDate(m.date))}</span>${m.opponent_country ? `<span>${esc(m.opponent_country)}</span>` : ""}${m.event ? `<span>${esc(m.event)}</span>` : ""}${m.surface ? `<span>${esc(m.surface)}</span>` : ""}</span>
        ${scoreboard(m)}
        <span class="result ${m.result}" aria-label="${m.result === "W" ? "Won" : "Lost"}">${m.result}</span>
      </button>
      ${open ? `<div class="match-body">
        ${m.summary ? `<p>${esc(m.summary)}</p>` : ""}
        ${linked.length ? `<ul class="linked">${linked.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>` : ""}
        <div class="row-actions"><button data-edit="match" data-id-ref="${m.id}">Edit</button><button data-add="note" data-match="${m.id}">Add note</button><button class="danger" data-del="matches" data-id-ref="${m.id}">Delete</button></div>
      </div>` : ""}
    </li>`;
  }).join("");
}
$("#matchList").addEventListener("click", (e) => {
  const t = e.target.closest("[data-toggle]");
  if (!t) return;
  const id = t.dataset.toggle;
  openMatches.has(id) ? openMatches.delete(id) : openMatches.add(id);
  renderMatches();
});

/* ---------------- Notes ---------------- */
const KINDS = ["match", "practice", "tactics", "mindset", "fitness"];
let noteFilter = "all";
function renderNotes() {
  const { notes, matches } = getState();
  const present = KINDS.filter((k) => notes.some((n) => n.kind === k));
  $("#noteFilters").innerHTML = notes.length
    ? ["all", ...present].map((k) => `<button data-filter="${k}" aria-pressed="${noteFilter === k}">${k === "all" ? "All" : cap(k)}</button>`).join("")
    : "";
  const list = notes.filter((n) => noteFilter === "all" || n.kind === noteFilter);
  if (!notes.length) {
    $("#noteList").innerHTML = `<div class="empty">Your journal is empty. After a match or practice, talk it through with the coach — it'll save what matters here.<br><button data-go="coach">Talk to the coach</button></div>`;
    return;
  }
  const byDay = new Map();
  for (const n of list) (byDay.get(n.date) || byDay.set(n.date, []).get(n.date)).push(n);
  $("#noteList").innerHTML = [...byDay].map(([d, items]) => `<section class="day"><h2>${esc(fmtDate(d, { weekday: "long", month: "long", day: "numeric" }))}</h2>
    ${items.map((n) => {
      const m = matches.find((x) => x.id === n.match_id);
      return `<article class="note k-${n.kind}" data-id="${n.id}"><p>${esc(n.text)}</p>
        <footer><span class="kind">${cap(n.kind)}</span>${m ? `<button class="to-match" data-jump="${m.id}">vs ${esc(m.opponent)}</button>` : ""}
        <span class="row-actions"><button data-edit="note" data-id-ref="${n.id}">Edit</button><button class="danger" data-del="notes" data-id-ref="${n.id}">Delete</button></span></footer></article>`;
    }).join("")}</section>`).join("");
}
$("#noteFilters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (b) { noteFilter = b.dataset.filter; renderNotes(); }
});
$("#noteList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-jump]");
  if (b) show("matches", b.dataset.jump);
});

/* ---------------- Focus ---------------- */
const TIERS = [
  ["now", "Now", "This week's work. Keep it to three."],
  ["next", "Next", "Lined up once the current work sticks."],
  ["later", "Later", "On the radar."],
];
const STATUS = ["working", "improving", "solid"];
const STATUS_LABEL = { working: "Working on it", improving: "Improving", solid: "Solid" };

function renderFocus() {
  const { focus, profile } = getState();
  $("#profile").innerHTML = `
    ${profile.cue ? `<p class="cue">${esc(profile.cue)}</p>` : ""}
    <p><b>Goal</b> ${esc(profile.goal || "Not set")}</p>
    <p><b>UTR</b> ${profile.utr != null ? esc(profile.utr) : "Not set"}</p>
    ${profile.strengths?.length ? `<p style="grid-column:1/-1"><b>Strengths</b> ${profile.strengths.map(esc).join(", ")}</p>` : ""}
    <div class="row-actions"><button data-edit="profile">Edit profile</button></div>`;
  if (!focus.length) {
    $("#focusList").innerHTML = `<div class="empty">No focus areas yet. Ask the coach what you should be working on.<br><button data-go="coach">Talk to the coach</button></div>`;
    return;
  }
  $("#focusList").innerHTML = TIERS.map(([key, label, sub]) => {
    const items = focus.filter((f) => f.priority === key);
    if (!items.length) return "";
    return `<section class="tier"><h2>${label}</h2><p>${sub}</p><div class="areas">${items.map(area).join("")}</div></section>`;
  }).join("");
}
function area(f) {
  return `<article class="area ${f.evidence === "hypothesis" ? "hypothesis" : ""}" data-id="${f.id}">
    <div class="area-top"><h3>${esc(f.title)}</h3><button class="status-btn" data-s="${f.status}" data-cycle="${f.id}" aria-label="Status: ${STATUS_LABEL[f.status]}. Change status">${STATUS_LABEL[f.status]}</button></div>
    ${f.why ? `<p class="why">${esc(f.why)}</p>` : ""}
    ${f.evidence === "hypothesis" ? `<p class="hyp">Coach's hypothesis — not confirmed yet</p>` : ""}
    ${f.cue ? `<p class="acue">${esc(f.cue)}</p>` : ""}
    ${f.drills?.length ? `<ul class="drills">${f.drills.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    ${f.progress?.length ? `<ul class="progress">${f.progress.slice(0, 4).map((p) => `<li><time>${esc(fmtDate(p.date, { month: "short", day: "numeric" }))}</time>${esc(p.text)}</li>`).join("")}</ul>` : ""}
    <div class="row-actions"><button data-edit="focus" data-id-ref="${f.id}">Edit</button><button class="danger" data-del="focus" data-id-ref="${f.id}">Delete</button></div>
  </article>`;
}
$("#focusList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cycle]");
  if (!b) return;
  const f = getState().focus.find((x) => x.id === b.dataset.cycle);
  update(() => { f.status = STATUS[(STATUS.indexOf(f.status) + 1) % STATUS.length]; f.updated = today(); });
  manualEdit();
});

function renderNowPanel() {
  const { focus, matches, profile } = getState();
  const now = focus.filter((f) => f.priority === "now").slice(0, 3);
  const last = matches[0];
  $("#nowPanel").innerHTML = `
    ${profile.cue ? `<h2>Match cue</h2><p class="cue-big">${esc(profile.cue)}</p>` : ""}
    ${now.length ? `<h2>Working on now</h2><ol>${now.map((f) => `<li><button data-jumpfocus="${f.id}"><b>${esc(f.title)}</b><span>${STATUS_LABEL[f.status]}</span></button></li>`).join("")}</ol>` : ""}
    ${last ? `<h2>Last match</h2><ol><li><button data-jumpmatch="${last.id}"><b>${last.result === "W" ? "Won" : "Lost"} vs ${esc(last.opponent)}</b><span>${esc(last.score)}</span></button></li></ol>` : ""}`;
}
$("#nowPanel").addEventListener("click", (e) => {
  const f = e.target.closest("[data-jumpfocus]"), m = e.target.closest("[data-jumpmatch]");
  if (f) show("focus", f.dataset.jumpfocus);
  if (m) show("matches", m.dataset.jumpmatch);
});

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function renderAll() { renderMatches(); renderNotes(); renderFocus(); renderNowPanel(); }
subscribe(renderAll);
renderAll();

/* ---------------- Sheets (manual add / edit) ---------------- */
const sheet = $("#sheet"), form = $("#sheetForm");
const field = (name, label, value, attrs = "", hint = "") =>
  `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value ?? "")}" ${attrs}>${hint ? `<small>${hint}</small>` : ""}</label>`;
const area_ = (name, label, value, rows = 3, hint = "") =>
  `<label class="field"><span>${label}</span><textarea name="${name}" rows="${rows}">${esc(value ?? "")}</textarea>${hint ? `<small>${hint}</small>` : ""}</label>`;
const select = (name, label, value, opts) =>
  `<label class="field"><span>${label}</span><select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;

function openSheet(title, inner, onSave, saveLabel = "Save") {
  form.innerHTML = `<h2>${title}</h2>${inner}<p class="form-error" hidden></p>
    <div class="sheet-actions"><button value="cancel" class="ghost" formnovalidate>Cancel</button><button value="save" class="primary">${saveLabel}</button></div>`;
  form.onsubmit = (e) => {
    if (e.submitter?.value !== "save") return;
    const data = Object.fromEntries(new FormData(form));
    const err = onSave(data);
    if (err) { e.preventDefault(); const p = $(".form-error", form); p.textContent = err; p.hidden = false; }
    else manualEdit();
  };
  sheet.showModal();
  $("input, textarea, select", form)?.focus();
}

const n = (v) => (v === "" || v == null ? null : Number(v));
const s = (v) => (v && v.trim() ? v.trim() : null);

function matchSheet(m) {
  openSheet(m ? "Edit match" : "Add match", `
    <div class="pair">${field("date", "Date", m?.date ?? today(), 'type="date"')}${select("result", "Result", m?.result ?? "L", [["W", "Won"], ["L", "Lost"]])}</div>
    ${field("opponent", "Opponent", m?.opponent, "required")}
    <div class="pair">${field("opponent_country", "Country", m?.opponent_country)}${field("opponent_utr", "Their UTR", m?.opponent_utr, 'inputmode="decimal"')}</div>
    ${field("score", "Score", m?.score, 'required placeholder="6-4 3-6 [10-7]"', "Your games first. Match tiebreak in brackets, set tiebreak in parentheses.")}
    <div class="pair">${field("event", "Event", m?.event)}${field("surface", "Surface", m?.surface)}</div>
    ${area_("summary", "How it went", m?.summary)}`,
  (d) => {
    const args = { date: s(d.date), opponent: s(d.opponent), opponent_country: s(d.opponent_country), opponent_utr: n(d.opponent_utr), score: s(d.score), result: d.result, event: s(d.event), surface: s(d.surface), summary: s(d.summary) };
    const r = JSON.parse(runTool(m ? "update_match" : "log_match", m ? { id: m.id, ...args } : args).output);
    return r.ok ? null : r.error;
  }, m ? "Save changes" : "Add match");
}

function noteSheet(note, matchId) {
  const { matches } = getState();
  openSheet(note ? "Edit note" : "Add note", `
    ${area_("text", "Note", note?.text, 4)}
    <div class="pair">${select("kind", "Type", note?.kind ?? (matchId ? "match" : "practice"), KINDS.map((k) => [k, cap(k)]))}${field("date", "Date", note?.date ?? today(), 'type="date"')}</div>
    ${select("match_id", "Related match", note?.match_id ?? matchId ?? "", [["", "None"], ...matches.map((m) => [m.id, `${m.result} vs ${m.opponent}${m.date ? ", " + fmtDate(m.date, { month: "short", day: "numeric" }) : ""}`])])}`,
  (d) => {
    if (!s(d.text)) return "Write the note first.";
    if (note) { update(() => Object.assign(note, { text: s(d.text), kind: d.kind, date: s(d.date) || today(), match_id: s(d.match_id) })); return null; }
    const r = JSON.parse(runTool("add_note", { kind: d.kind, text: d.text, date: s(d.date), match_id: s(d.match_id) }).output);
    return r.ok ? null : r.error;
  }, note ? "Save changes" : "Add note");
}

function focusSheet(f) {
  openSheet(f ? "Edit focus area" : "Add focus area", `
    ${field("title", "What to work on", f?.title, "required")}
    ${area_("why", "Why it matters", f?.why, 2)}
    ${field("cue", "Cue", f?.cue)}
    ${area_("drills", "Drills", f?.drills?.join("\n"), 3, "One per line.")}
    <div class="pair">${select("priority", "Priority", f?.priority ?? "next", TIERS.map(([k, l]) => [k, l]))}${select("status", "Status", f?.status ?? "working", STATUS.map((k) => [k, STATUS_LABEL[k]]))}</div>
    ${select("evidence", "Based on", f?.evidence ?? "observed", [["observed", "What I've seen in matches or practice"], ["hypothesis", "A hunch to test"]])}`,
  (d) => {
    const r = JSON.parse(runTool("set_focus_area", { id: f?.id ?? null, title: s(d.title), why: s(d.why) ?? (f ? "" : null), cue: s(d.cue) ?? (f ? "" : null), drills: d.drills.split("\n").map((x) => x.trim()).filter(Boolean), priority: d.priority, status: d.status, evidence: d.evidence, progress_note: null }).output);
    return r.ok ? null : r.error;
  }, f ? "Save changes" : "Add area");
}

function profileSheet() {
  const p = getState().profile;
  openSheet("Edit profile", `
    ${field("cue", "Match cue", p.cue)}
    ${field("goal", "Goal", p.goal)}
    ${field("utr", "Your UTR", p.utr, 'inputmode="decimal"')}
    ${area_("strengths", "Strengths", p.strengths?.join("\n"), 3, "One per line.")}`,
  (d) => {
    update((st) => Object.assign(st.profile, { cue: s(d.cue), goal: s(d.goal), utr: n(d.utr), strengths: d.strengths.split("\n").map((x) => x.trim()).filter(Boolean) }));
    return null;
  });
}

function confirmDelete(coll, id) {
  const item = getState()[coll].find((x) => x.id === id);
  const what = item.title ? `"${item.title}"` : item.opponent ? `the match vs ${item.opponent}` : "this note";
  openSheet("Delete?", `<p style="margin:0;color:var(--chalk-2)">This removes ${esc(what)} from this device. It can't be undone.</p>`, () => {
    runTool("delete_item", { collection: coll, id });
    return null;
  }, "Delete");
}

document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"), edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]"), go = e.target.closest("[data-go]");
  if (go) return show(go.dataset.go);
  if (add) {
    const k = add.dataset.add;
    return k === "match" ? matchSheet() : k === "note" ? noteSheet(null, add.dataset.match) : focusSheet();
  }
  if (edit) {
    const k = edit.dataset.edit, id = edit.dataset.idRef, st = getState();
    if (k === "match") return matchSheet(st.matches.find((x) => x.id === id));
    if (k === "note") return noteSheet(st.notes.find((x) => x.id === id));
    if (k === "focus") return focusSheet(st.focus.find((x) => x.id === id));
    if (k === "profile") return profileSheet();
  }
  if (del) return confirmDelete(del.dataset.del, del.dataset.idRef);
});

/* ---------------- Menu: backup ---------------- */
$("#menuBtn").addEventListener("click", () => {
  openSheet("Your data", `
    <p style="margin:0;color:var(--chalk-2)">Matches, notes and focus areas are saved in this browser only. Download a backup to move them to another device.</p>
    <div class="row-actions" style="margin:0"><button type="button" id="exportBtn">Download backup</button><button type="button" id="importBtn">Restore from backup</button></div>
    <input type="file" id="importFile" accept="application/json" hidden>`, () => null, "Done");
  $(".ghost", form).hidden = true;
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `tennisos-backup-${today()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#importFile").onchange = async (e) => {
    try { replaceAll(JSON.parse(await e.target.files[0].text())); sheet.close(); toast("Backup restored."); manualEdit(); }
    catch (err) { const p = $(".form-error", form); p.textContent = err.message || "Couldn't read that file."; p.hidden = false; }
  };
});

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------------- Coach ---------------- */
const STATUS_TEXT = {
  idle: "Tap the ball to talk",
  connecting: "Connecting to your coach",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Coach is talking",
};
let mode = "idle", muted = false, configured = null;
const orb = createOrb($("#orb"), () => (DEMO ? demoLevels() : voice.levels()));
const lines = new Map(); // item id → text

const voice = createVoice({
  onMode: setMode,
  onTranscript: ({ role, id, delta, text, final }) => {
    const prev = lines.get(id) || "";
    const next = final && text ? text : prev + (delta || "");
    lines.set(id, next);
    if (role === "coach") setCoachLine(next);
    else $("#youLine").textContent = next;
  },
  onChange: onAiChange,
  onError: (msg) => { setCoachLine(msg); },
});

function setMode(m) {
  mode = m;
  orb.setMode(m);
  $("#status").textContent = muted && m !== "idle" ? "Muted" : STATUS_TEXT[m] || "";
  const live = m !== "idle";
  const btn = $("#mainBtn");
  btn.textContent = m === "idle" ? "Start talking" : m === "connecting" ? "Connecting…" : "End";
  btn.classList.toggle("live", live);
  $("#ballBtn").setAttribute("aria-label", live ? "End conversation" : "Start talking to your coach");
  $("#muteBtn").disabled = !live || m === "connecting";
  if (!live) { muted = false; $("#muteBtn").setAttribute("aria-pressed", "false"); }
}

function setCoachLine(t, long = false) {
  const el = $("#coachLine");
  el.textContent = t;
  el.style.webkitLineClamp = long ? "unset" : "";
  el.style.fontSize = long && t.length > 220 ? "17px" : "";
}

async function toggleVoice() {
  if (DEMO) return demoRun();
  if (voice.active || mode !== "idle") return voice.stop();
  if (configured === false) return setCoachLine("The coach isn't connected yet. Add OPENAI_API_KEY in your Vercel project settings, then redeploy.");
  $("#saved").innerHTML = "";
  $("#youLine").textContent = "";
  voice.start();
}
$("#mainBtn").addEventListener("click", toggleVoice);
$("#ballBtn").addEventListener("click", toggleVoice);
$("#muteBtn").addEventListener("click", () => {
  muted = voice.toggleMute();
  $("#muteBtn").setAttribute("aria-pressed", String(muted));
  $("#muteBtn").setAttribute("aria-label", muted ? "Unmute microphone" : "Mute microphone");
  setMode(mode);
});

function onAiChange(change) {
  const li = document.createElement("li");
  li.innerHTML = `<button>${esc(change.label)}</button>`;
  li.firstChild.addEventListener("click", () => show(change.screen, change.id));
  $("#saved").append(li);
  if (current !== change.screen) document.querySelector(`[data-tab="${change.screen}"] .dot`)?.removeAttribute("hidden");
  if (current !== "coach") toast(change.label);
}

function manualEdit() { if (voice.active) voice.refreshContext(); }

// Typing
const composer = $("#composer"), input = $("#composerInput");
$("#typeBtn").addEventListener("click", () => {
  composer.hidden = !composer.hidden;
  if (!composer.hidden) input.focus();
});
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); } });
composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = ""; input.style.height = "auto";
  $("#youLine").textContent = text;
  if (voice.active) return voice.sendText(text);
  if (configured === false) return setCoachLine("The coach isn't connected yet. Add OPENAI_API_KEY in your Vercel project settings, then redeploy.");
  const send = $(".send", composer); send.disabled = true;
  orb.setMode("thinking"); $("#status").textContent = "Thinking";
  try { setCoachLine(await askCoach(text, onAiChange) || "Saved.", true); }
  catch (err) { setCoachLine(err.message); }
  finally { send.disabled = false; orb.setMode("idle"); $("#status").textContent = STATUS_TEXT.idle; }
});

fetch("/api/status").then((r) => r.json()).then((d) => (configured = !!d.configured)).catch(() => (configured = null));

/* ---------------- Demo mode (?demo) — exercises the UI without an API key ---------------- */
let demoT0 = 0, demoPhase = "idle";
function demoLevels() {
  const t = (performance.now() - demoT0) / 1000;
  const wobble = (f) => Math.max(0, Math.sin(t * f) * 0.5 + 0.5) * (0.6 + 0.4 * Math.sin(t * 13.1));
  if (demoPhase === "you") return { input: 0.08 + wobble(7) * 0.12, output: 0 };
  if (demoPhase === "coach") return { input: 0, output: 0.06 + wobble(9) * 0.16 };
  return { input: 0, output: 0 };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function demoRun() {
  if (mode !== "idle") { demoPhase = "idle"; return setMode("idle"); }
  demoT0 = performance.now();
  setMode("connecting"); await wait(900);
  setMode("listening"); demoPhase = "you";
  const said = "Just lost to Marco Silva, four-six, six-three, eight-ten in the breaker. My backhand broke down on the big points again.";
  for (let i = 0; i <= said.length; i += 3) { $("#youLine").textContent = said.slice(0, i); await wait(40); }
  demoPhase = "idle"; setMode("thinking"); await wait(700);
  onAiChange(runTool("log_match", { date: today(), opponent: "Marco Silva", opponent_country: null, opponent_utr: null, score: "4-6 6-3 [8-10]", result: "L", event: null, surface: null, summary: "Backhand broke down on the big points." }).change);
  await wait(400);
  onAiChange(runTool("set_focus_area", { id: "f_bh_spacing", title: null, why: null, drills: ["Coach feeds 20 short backhands; split-step, two adjustment steps, hit to a big crosscourt target"], cue: "Set the space, then swing", priority: "now", status: null, evidence: null, progress_note: "Broke down on big points vs Marco Silva." }).change);
  setMode("speaking"); demoPhase = "coach";
  const reply = "Tough one — logged the loss to Silva. When the backhand went, was it late contact or getting jammed? I've added a short-ball spacing drill to your backhand focus for this week.";
  for (let i = 0; i <= reply.length; i += 3) { setCoachLine(reply.slice(0, i)); await wait(35); }
  await wait(600); demoPhase = "idle"; setMode("listening");
}

show(location.hash.slice(1) || "coach");

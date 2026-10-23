// Tool definitions shared by the voice (Realtime) and text (Responses) coach.
// The browser executes every call against the player's local workspace and
// returns the result, so the model only ever changes data through these.

const nullableString = (description) => ({ type: ["string", "null"], description });
const nullableNumber = (description) => ({ type: ["number", "null"], description });

export const TOOLS = [
  {
    type: "function",
    name: "log_match",
    description:
      "Record a match result the player has described. Only call once the opponent and the score are known from what the player said. Never guess a score, name, date or UTR — pass null for anything not stated.",
    parameters: {
      type: "object",
      properties: {
        date: nullableString("Match date as YYYY-MM-DD. Use today's date if the player says today; null if unknown."),
        opponent: { type: "string", description: "Opponent's name, or a description like 'Brazilian lefty' if the name is unknown." },
        opponent_country: nullableString("Opponent's country, if stated."),
        opponent_utr: nullableNumber("Opponent's UTR, if stated."),
        score: {
          type: "string",
          description:
            "Score from the player's perspective, sets separated by spaces. Set tiebreaks in parentheses with the loser's points, match tiebreaks in brackets. Examples: '6-4 3-6 [10-7]', '7-6(5) 6-3', '2-4 4-2 [7-10]'.",
        },
        result: { type: "string", enum: ["W", "L"], description: "W if the player won, L if they lost." },
        event: nullableString("Tournament, league or context (e.g. 'UTR Pro Series', 'practice set')."),
        surface: nullableString("Court surface if stated: hard, clay, grass, indoor."),
        summary: nullableString("One or two sentences on how the match was decided, in the player's own terms."),
      },
      required: ["date", "opponent", "opponent_country", "opponent_utr", "score", "result", "event", "surface", "summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_match",
    description: "Correct or add details to an existing match. Pass only the id plus fields that change; leave the rest null.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Match id from the workspace." },
        date: nullableString("YYYY-MM-DD"),
        opponent: nullableString("Opponent name"),
        opponent_country: nullableString("Country"),
        opponent_utr: nullableNumber("UTR"),
        score: nullableString("Corrected score"),
        result: { type: ["string", "null"], enum: ["W", "L", null] },
        event: nullableString("Event"),
        surface: nullableString("Surface"),
        summary: nullableString("Replacement summary"),
      },
      required: ["id", "date", "opponent", "opponent_country", "opponent_utr", "score", "result", "event", "surface", "summary"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "add_note",
    description:
      "Save a note to the player's journal: a match reflection, a practice observation, a tactical insight, or something about mindset or fitness. Write it in clear first-person shorthand the player would recognise later, keeping their specifics.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["match", "practice", "tactics", "mindset", "fitness"] },
        text: { type: "string", description: "The note, 1–4 sentences." },
        date: nullableString("YYYY-MM-DD the note refers to; today if unstated."),
        match_id: nullableString("Id of the related match, if the note is about one."),
      },
      required: ["kind", "text", "date", "match_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "set_focus_area",
    description:
      "Create a development area, or update one by passing its id. Use for things the player needs to work on. Mark evidence 'hypothesis' unless it is backed by repeated observations or the player states it as fact.",
    parameters: {
      type: "object",
      properties: {
        id: nullableString("Existing focus area id to update; null to create a new one."),
        title: nullableString("Short name, e.g. 'Backhand spacing on short balls'. Required when creating."),
        why: nullableString("What is happening now and why it matters, in one or two sentences."),
        drills: { type: ["array", "null"], items: { type: "string" }, description: "Concrete drills or reps. Replaces the existing list when given." },
        cue: nullableString("A short on-court cue for this area."),
        priority: { type: ["string", "null"], enum: ["now", "next", "later", null], description: "now = this week's work." },
        status: { type: ["string", "null"], enum: ["working", "improving", "solid", null] },
        evidence: { type: ["string", "null"], enum: ["observed", "hypothesis", null] },
        progress_note: nullableString("A dated progress update to append, if the player reported progress or a setback."),
      },
      required: ["id", "title", "why", "drills", "cue", "priority", "status", "evidence", "progress_note"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "delete_item",
    description: "Delete a match, note or focus area. Only call after the player has explicitly confirmed the deletion in this conversation.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", enum: ["matches", "notes", "focus"] },
        id: { type: "string" },
      },
      required: ["collection", "id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_profile",
    description: "Update the player's goal, current UTR, strengths or match cue when they state a change.",
    parameters: {
      type: "object",
      properties: {
        goal: nullableString("Long-term goal"),
        utr: nullableNumber("Player's own current UTR"),
        strengths: { type: ["array", "null"], items: { type: "string" } },
        cue: nullableString("Main match cue"),
      },
      required: ["goal", "utr", "strengths", "cue"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_workspace",
    description: "Read the player's full current workspace (all matches, notes, focus areas with ids). Use when you need details beyond the summary you were given.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

// Realtime sessions take the same shape minus strict-mode extras.
export const REALTIME_TOOLS = TOOLS.map(({ type, name, description, parameters }) => ({ type, name, description, parameters }));
export const RESPONSES_TOOLS = TOOLS.map((t) => ({ ...t, strict: true }));

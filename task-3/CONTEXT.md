# Task 3 — Context

Domain language for the n8n + Telegram learning assistant. Definitions here override the looser usage in `task-3-description.md`.

## Language

**User**:
A Telegram chat partner identified by `chat_id`. Private chats only — the bot's identity model is one row per `chat_id`, not per Telegram account. No bot account abstraction beyond this.
_Avoid_: "account", "Telegram user" (ambiguous between user_id and chat_id).

**LearningMaterial**:
A URL submitted by a **User** via `/learn`, paired with the extracted text content, a **Teacher**-produced summary, and an assessed difficulty. Scoped to the submitting `chat_id` — a `LearningMaterial` is private to its owner.
_Avoid_: "article", "topic" (used loosely in the description).

**Extracted content**:
The clean, Markdown-formatted text body of a **LearningMaterial**'s URL — the chrome (nav, sidebar, footer, scripts) has been stripped. This is what the **Teacher** and **Examiner** actually read; the raw HTML is never stored or seen by the AI. Sourced from Jina Reader (`r.jina.ai/<url>`).
_Avoid_: "HTML", "raw content".

**Teacher**:
The AI role that, given the **extracted content** of a **LearningMaterial**, produces a structured **Summary** with a fixed shape: a `title` (inferred), 3–5 `mainConcepts` (short noun-phrase keywords), 5–7 `keyPoints` (one-sentence bullets), and a `difficulty` (`beginner` | `intermediate` | `advanced`). Acts once at `/learn` time. Not a user-facing identity — invisible behind the bot's voice.

**Summary**:
The Teacher's output for a **LearningMaterial**. Persisted as part of the material row so the user sees the same summary on re-display. Rendered to the user in Telegram HTML parse mode with a difficulty badge and a "Quiz me now" inline button.

**Examiner**:
The AI role that, for a given **LearningMaterial**, produces a fresh five-question multiple-choice **Quiz** at the moment of generation in a single API call. Each question has exactly 4 options (`A`/`B`/`C`/`D`), one `correctAnswer` key, and a `perOptionExplanation` map giving a targeted rationale for **each** option (why correct or why wrong). Acts on the full **extracted content**, not just the **Summary**. Independent of the **Teacher**. Runtime answer validation is a literal lookup against the stored `correctAnswer`; the per-option explanations are pre-generated, never recomputed.

**Intelligent validation**:
The spec phrase "validation is intelligent — not exact text match only." Resolved as: the *intelligence* lives in the **Examiner**'s pre-generated `perOptionExplanation` map (a distinct, content-grounded rationale for each distractor), not in fuzzy matching of the user's tap. Runtime answer handling is a deterministic lookup.

**Quiz**:
A set of exactly five multiple-choice questions tied to one **LearningMaterial** and one **User**. Generated fresh by the **Examiner** each time the User starts a new quiz attempt (i.e. it is not cached across attempts).

**Quiz lifecycle**:
A `Quiz` is in one of two states: `in_progress` (created, not all five questions answered) or `completed` (all answered, final score recorded). At most one `in_progress` `Quiz` per (`chat_id`, `LearningMaterial`) at any time.

**Resume-or-restart**:
When a **User** runs `/quiz` on a material that has an `in_progress` `Quiz`, the bot prompts to **resume** the existing attempt or **start fresh**. If they start fresh, the in-progress attempt is discarded and the **Examiner** generates new questions. If they resume, the saved questions continue from the last unanswered one. If there is no `in_progress` `Quiz`, a new one is generated immediately with no prompt.

## Relationships

- A **User** owns zero or more **LearningMaterials**, keyed by `chat_id`.
- A **LearningMaterial** has zero or more historical **Quiz** attempts; at most one is `in_progress` at any time.
- A **Quiz** belongs to exactly one **LearningMaterial** and one **User**.
- The **Teacher** acts on a **LearningMaterial** once (at `/learn` time); the **Examiner** acts on it every time a fresh **Quiz** is generated.

## Flagged ambiguities

- The brief uses "topic" interchangeably with "material" in the `/quiz` topic picker. Resolved: the picker lists **LearningMaterials** by title; "topic" is a UI label, not a domain entity.
- The brief implies a single "Quiz" entity per material. Resolved: a **Quiz** is per-attempt, not per-material; a material can produce many quizzes over time.

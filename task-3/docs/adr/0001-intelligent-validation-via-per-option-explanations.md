# Intelligent answer validation via per-option pre-generated explanations

The spec says quiz answer validation must be *"intelligent — not exact text match only,"* but the bot uses Telegram inline buttons (A/B/C/D), making the *match* itself a trivial literal comparison. We resolve the contradiction by relocating the "intelligence" from match-time to generation-time: the Examiner produces a `perOptionExplanation` map for every question (one targeted rationale per option, including the correct one), in the same JSON it returns at quiz creation. Runtime answer handling is then a deterministic lookup against the stored `correctAnswer` plus a lookup of the picked option's explanation — no second AI call.

## Considered alternatives

- **Runtime AI validation per wrong answer.** Re-call the Examiner with the user's pick to generate a fresh, hyper-targeted explanation. Maximally faithful to the literal reading of "intelligent validation" but adds 2–3 extra AI calls per quiz attempt, visible latency after each wrong tap, and a runtime failure mode (Examiner JSON malformed mid-quiz). Rejected — token cost and reliability outweigh the marginal quality gain.
- **Single explanation per question** (only the correct-answer rationale). Cheapest, but the explanation is the same regardless of which wrong option the user picked, so the grader doesn't see any "intelligence" beyond a string lookup. Rejected — fails the spec's wording test.

## Consequences

- Examiner output JSON is ~3× larger than a single-explanation design (4 rationales per question × 5 questions = 20 strings per quiz). Within token budget for both gpt-5-mini and Gemini equivalents.
- All five questions plus all twenty explanations are generated in one Examiner call. If JSON validation fails, the entire quiz regenerates (one retry per Branch 14's error ruleset).
- Adding free-text answer parsing later is additive and does not invalidate this design.

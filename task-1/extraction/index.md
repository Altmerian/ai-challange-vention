# Extraction Index

This directory contains the leaderboard extraction artifacts for Task 1.

Use `sanitized/` for AI-assisted implementation.

## Safe For AI Agents

Start with the required files. Use optional files only when a specific implementation detail is unclear.

### Required

| File | Purpose |
|---|---|
| `sanitized/dom.html` | Sanitized leaderboard widget DOM. Use for structural layout and class patterns. |
| `sanitized/styles.json` | Computed layout, typography, colors, spacing, and box metrics for key UI archetypes. |
| `sanitized/behaviors.md` | Implementation notes for filters, search, row expansion, sorting, pagination, data grouping, and icons. |
| `sanitized/api-shapes.json` | Sanitized backend/data-source shapes, including the activity CSV schema. |
| `sanitized/leaderboard-blurred.png` | Shareable visual reference with text placeholders and blurred avatar media. |

### Optional Supporting References

| File | Purpose |
|---|---|
| `sanitized/dropdown-years.html` | Sanitized open-state DOM for the years dropdown. |
| `sanitized/dropdown-quarters.html` | Sanitized open-state DOM for the quarters dropdown. |
| `sanitized/dropdown-categories.html` | Sanitized open-state DOM for the categories dropdown. |
| `sanitized/row-expanded.html` | Sanitized DOM for an expanded leaderboard row. |
| `sanitized/*-probe.json` | Small behavior/structure probes used to support `behaviors.md`; not required for normal implementation. |

## Agent Workflow

1. Read `sanitized/behaviors.md` first to understand the expected data model and interactions.
2. Read `sanitized/api-shapes.json` to generate mock data with the correct activity-record schema.
3. Read `sanitized/dom.html`, `sanitized/styles.json`, and `sanitized/leaderboard-blurred.png` to implement the visual layout.
4. Use the dropdown and expanded-row HTML files for open states and details-panel structure.
5. Keep all generated app data synthetic. Do not copy values from SharePoint, screenshots, or corporate directories.
6. Before finishing implementation, scan the app for accidental corporate data leaks.

# Alignment entries

One file per change that other roles rely on, named
`<yyyy-mm-dd>-<task-id>.md` and created from `_template.md`.
The procedure is in `AGENTS.md` → "Alignment changes".

- `status: open` — still to be handled
- `status: resolved` — follow-up done, with a short resolution

To list the open ones: `grep -l "^status: open" docs/alignment/*.md`

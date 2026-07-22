# TVC — Proposal

## Stage goal

Create three or four detailed TVC directions with genuinely different creative mechanisms and obtain one explicit selection.

## Required inputs

Read `brief.md`, `research.md`, `research-sources.json` and usable source assets. Use sourced findings without presenting client claims or inference as verified fact.

## Domain instructions

Each direction must be complete enough to determine the film: stable ID, title, one-line big idea, audience insight, creative mechanism, narrative arc, product role, key moments, visual language, sound approach within the audio policy, CTA, mandatory elements, risks and why it can work. Differences must be structural, not merely style names. Make trade-offs visible.

## Output contract

Write one `proposals/<id>.md` per direction. Write `proposals/index.json` with exactly three or four unique `{id,title,summary,path,tradeoffs}` entries. After the user selects, write `proposals/selected.json` containing `proposalId` and any accepted comment.

## Review and completion

Commit the proposal files and index, request a `select` Interaction targeting the index and proposal files with options using stable proposal IDs, append and commit the Decision, then write and commit `selected.json`. Complete only when the selected ID exists and the Decision remains current for the reviewed set.

## Boundaries

Do not split the film into Units, write Storyboard Sheets or Provider prompts, or generate media.

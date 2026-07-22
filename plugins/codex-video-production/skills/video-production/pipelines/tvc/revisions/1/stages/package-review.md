# TVC — Package Review

## Stage goal

Audit the complete current production package before deterministic assembly.

## Required inputs

Read Brief, selected Proposal, Structure, Storyboards, Plans, Clips, source index and current committed Decision and Task evidence.

## Domain instructions

Trace mandatory Brief elements through Proposal, Units, Storyboards, Plans and Clips. Verify ordered Unit mapping, duration total and 15000ms maximum, ratio, Prompt reference numbering, real references, continuity files, approved Storyboards/Plans/Clips and successful Task provenance. Create one actionable issue per defect with severity, affected paths, summary and suggested fix. High severity includes missing output, broken mapping, unsupported core claim, missing required Storyboard reference, or duration/ratio mismatch.

## Output contract

Write `package-review.md` with YAML front matter containing `pass` and `issues`; each issue contains `severity`, `paths`, `summary`, and `suggestedFix`. The body reports the full mapping and evidence checked.

## Review and completion

Commit the report. No routine user Review is required. Complete only when every Unit is covered, `pass: true`, and there is no high-severity issue; otherwise open an explicit correction at the earliest affected Stage.

## Boundaries

Do not repair files silently, generate media, approve creative quality or assemble the film.

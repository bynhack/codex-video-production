# TVC — Storyboard Production

## Stage goal

Produce or import reviewable Storyboard candidates and select one durable Storyboard per Unit.

## Required inputs

Read every `storyboard-plan.json`, referenced source file and open execution gate. A description or future file is not a reference.

## Domain instructions

Use only the `lovart-unofficial` skill for media calls. Each call produces one complete Storyboard Sheet for one Unit, never one call or file per panel. If submission fails because parameters are invalid, inspect Lovart help, correct the request and retry under the durable Task rules. Before each call append `task-created`; persist Provider submission and state transitions only when state changes. Download real results into `units/<unitId>/storyboard-candidates/`. Generate all independent Units first, poll them as a batch, then present one batch review. A directly usable user asset may be copied byte-for-byte as a candidate without inventing a Provider Task.

## Output contract

Keep one or more whole-sheet PNG candidates at `units/<unitId>/storyboard-candidates/*.png`. After selection copy the selected bytes to `units/<unitId>/storyboard.png`. Do not persist derived panel crops. Task evidence remains in `tasks.jsonl` and must point to the real selected source unless it is an imported asset.

## Review and completion

Commit candidates, request a `target-review` or `batch-review` covering each candidate directory, append and commit the Decision, then commit canonical `storyboard.png` files. Complete only when every Unit has current select/approve evidence and matching candidate bytes. Pause video execution behind `tvc.unit-video-production@1`.

## Boundaries

Do not generate video or audio, let Preview call Providers, or use any media skill other than Lovart.

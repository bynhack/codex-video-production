# TVC — Unit Video Production

## Stage goal

Generate, inspect and approve one current Clip per Unit while preserving approved Plans and continuity.

## Required inputs

Read each current `plan.json`, Storyboard and real reference. Require `executable: true`, current Plan approval and an open execution gate before a paid call. Tail-frame Units additionally require the actual prior approved frame in the approved Plan.

## Domain instructions

Use only the `lovart-unofficial` skill. Append `task-created` before Provider submission; on invalid parameters inspect Lovart help and correct them. Submit every currently independent Unit first, then poll all Tasks together. Record only Attempt state transitions; no-change polls need no ledger event. Download results into `clip-candidates/`. For tail-frame dependencies, process only the necessary dependency chain serially and persist the selected prior final frame before updating the deferred Plan. Retry preserves the Task request; redo creates a new Task. Preserve model-native audio and user audio only.

## Output contract

Store candidates at `units/<unitId>/clip-candidates/*.mp4`; copy selected bytes to `units/<unitId>/clip.mp4`. If required, store `units/<unitId>/tail-frame.png`. Every selected candidate has a successful video-generation Task in `tasks.jsonl`.

## Review and completion

After candidates are ready, request one batch/target review covering every Unit candidate directory, append and commit the Decision, and commit canonical clips. Complete only when all Units have current select/approve evidence, successful Task provenance and real continuity files.

## Boundaries

Do not assemble the final film, invent references, treat Provider success as user approval, or let Preview call Providers.

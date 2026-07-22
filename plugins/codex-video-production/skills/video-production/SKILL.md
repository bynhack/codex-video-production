---
name: video-production
description: Drive a Codex-owned TVC production from an immature request and optional product materials through clarification, sourced research, proposals, generation units, storyboards, unit clips, assembly and final review.
---

# Video Production

Use this Skill for end-to-end TVC work. Codex is the only planner and orchestrator. Preview displays committed Production files and collects structured decisions. The Bridge validates and persists; it never chooses a next Stage, calls a media Provider, polls, retries, or edits creative files.

## Start and recover

1. Ask for or choose an absolute empty `outputDir`. Call `video_preview_start` with the bundled `tvc` Pipeline. To restore, pass the exact `outputDir + productionId`. Immediately after the tool succeeds, send the returned Preview URL to the user in commentary before any other tool call or production work, so the page is available while later Stages publish live updates.
2. The output directory is the Production and its own Git repository. Write `request.md`, copy optional source materials under `assets/`, write `assets/index.json`, then commit them with the initialized Store files.
3. Never edit `state.json`, `decisions.jsonl` or `tasks.jsonl` with file tools. Commit their Store-written changes at the checkpoints described below.
4. Read the current Pipeline Manifest. Before each Stage, load only that Stage Prompt. Follow the Stages in declared order; do not invent automatic branches.
5. Treat the installed Plugin snapshot as immutable during Production work. If a Bridge or MCP contract call fails, report the exact tool and error, then stop. Never locate, inspect or edit Plugin source from the Production task; resume only after a separate development task installs a fixed snapshot.

## Stage rhythm

For each Stage:

1. Read its committed `requires` files and current Stage Prompt.
2. Write ordinary files named by `produces`, validate them, and create a content commit.
3. Call `video_preview_publish` with only a notice and focus paths.
4. If Review is required, call `video_preview_request_interaction` with the current `stageId` and committed target paths, share the Preview URL in commentary, then call `video_preview_wait_interaction` with the maximum allowed timeout. While it remains waiting, call it again in the same turn. Do not end the turn merely to ask the user to open or submit Preview; keep waiting until the Interaction is submitted, explicitly cancelled, or the tool fails.
5. Call `video_preview_append_decision`, immediately commit `decisions.jsonl` and `state.json`, then interpret the result. Never construct a Decision yourself.
6. Call `video_preview_update_state` with `complete-stage` and the next `activate-stage`. Commit the Store-written `state.json`.

For `target-review` and `batch-review`, send the review fields and committed `targetPaths` only. Never add `mediaTaskId` or `allowedTaskActions`; those fields belong exclusively to `task-control-request`. A per-target `redo` is already a valid review result and needs no request-side action declaration.

Proposal has exactly one user Interaction. Write 3–4 complete text Proposals, then generate one whole-film Concept Storyboard for every direction before asking the user to choose. `proposals/index.json` is an object whose top-level `proposals` array contains those directions; never write the index as a bare JSON array. Every image Task uses that direction's request file and includes the matching Proposal Markdown in `dependencyPaths`. Request one `select` targeting the index, every text Proposal, every request and every image; append its Decision before writing `selected.json`. Text remains semantic authority. Never open a preliminary Interaction, and never request a second Interaction while a submitted one still awaits `append_decision`.

Concept and Unit Storyboards are each one complete generated sheet image. Never split their drawn panels into separate files or reconstruct them in Preview. `proposals/*-concept-storyboard.png` visualizes each direction for creative comparison; `units/*/storyboard.png` is the per-Unit production reference used by video generation.

Keep Generation Units minimal. A Unit is one Provider clip, not one shot, selling point or Storyboard panel. Use the Provider's available duration before adding another Unit: a 30-second TVC normally becomes two approximately 15-second Units, while each Unit's Storyboard may contain many shots. Add a Unit only for a concrete generation boundary and record the reason. Video prompts must preserve the Storyboard's internal timed shot rhythm and must not turn it into one slow move or padded hold.

Classify supplied product images in `assets/index.json` as `kind: image, role: product-reference`. Every Unit Storyboard Plan must reference at least one such local product image when available. Its image-generation Task uses that Plan as `requestRef`, stamps every Plan reference as a dependency, and passes the exact references to Lovart. Preview shows the current Unit's prompt and resolved reference materials beside its Storyboard.

Use `video_preview_get` only for small state, one Task/Decision, or a ledger tail. Read Stage files with native file tools. Do not reconstruct or transmit a complete Production snapshot.

## Media rhythm

Only use `$lovart-unofficial` for Storyboard images and Unit videos. Do not inspect or invoke other media skills. If a Lovart submission fails because the request is invalid, use Lovart help, correct the parameters, and retry according to Task identity rules.

Before `task-created`, commit its `requestRef` and every dependency file so no Host-owned path is dirty. Then append `task-created`; the returned Task already contains Attempt 1 in `submitting` with a durable `clientRequestId`, and only then submit the exact stored request snapshot. Persist an Attempt event only at recovery-critical nodes: when you first obtain the provider submit ID, when it reaches a terminal state (`succeeded`, `failed`, `cancelled`), when it becomes `submission_unknown`, or when an error, cancellation or reconciliation appears. You need not persist a plain `running` heartbeat that carries no new fact, and never record identical polling diagnostics. `submission_unknown` requires Provider reconciliation and must never be blindly resubmitted.

Provider success ordering is strict: while the Host-owned tree is still clean, first append `attempt-transition: succeeded` with the Provider artifact URL and metadata; only after that event is durable may the Host download to a temporary file, atomically rename it to the target path, and commit the artifact together with the pending Task ledger. Never download or write the artifact before recording success.

Retry creates an Attempt on the same Task and request. Redo creates a new Task with `redoOfTaskId` and a current request file. If a succeeded Provider URL expires and cannot be refreshed, append `artifact-unrecoverable`; keep the Attempt succeeded and perform an explicit redo.

Default media cadence is:

- submit every currently independent Unit;
- poll all outstanding Tasks as one batch;
- download and commit candidates;
- request one batch review.

After Provider submission, keep the same turn alive and batch-poll until every submitted Task reaches a terminal state and every successful artifact is downloaded and committed. Do not end the turn with a final answer merely because media is still submitting, queued, or running; use brief commentary updates while polling. Stop only for an explicit user cancellation or a failure that requires user authority.

Serialize only real tail-frame dependency chains or an explicit correction. `structure.json`, continuity reference planning, Storyboard prompts and `plan.json` are internal executable files, not separate user approval pages. Paid `video-generation` uses the current `plan.json` as `requestRef`, must include that Unit's current `storyboard.png` in `dependencyPaths`, and cannot be created until the Store finds current approval evidence for that exact Storyboard selection.

Use local `scripts/assemble-tvc.mjs`/ffmpeg for deterministic assembly and probing. The TVC audio policy is model-native clip audio plus real user-supplied audio; do not generate music, TTS, or independent sound effects.

## Gates and correction

After Proposal, pause media execution behind `tvc.storyboard-production@1` before entering Storyboard Production. Storyboard Production internally writes Structure, continuity references and Storyboard Plans, generates candidates, copies the current candidate bytes to each canonical `storyboard.png`, then requests one batch review targeting those canonical files in Structure order. The Preview defaults every Unit to approve; the user marks only Units needing modification. Regenerate and re-review changed Units before completing. After Storyboard Production, pause Unit video execution behind `tvc.unit-video-production@1`. Unit Video Production internally writes Clip Plans, then exposes only actual video candidates for user review. Resume only with explicit capability evidence.

For correction, record the user Decision or precise system reason and call `reopen-from-stage`. Delete downstream current produces, commit the correction, then restore unaffected exact bytes from Git and rewrite only affected files. Exact-byte restoration restores the same Git object ID, so valid per-target approvals automatically become current again.

## Completion

The final `approve` Interaction targets `final/tvc.mp4` and `final/probe.json`. After its Decision is committed, call `video_preview_complete` with the current state revision, then commit the final `state.json`. Deliver `final/tvc.mp4` and the Production path.

For exact rules read [Pipeline contract](references/pipeline-contract.md), [Production contract](references/production-contract.md), and [Interaction contract](references/interaction-contract.md).

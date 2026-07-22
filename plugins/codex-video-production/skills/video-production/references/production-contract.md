# Production Contract

## Authority

The absolute `outputDir` is the Production and a standalone Git repository. Creative and media truth is ordinary committed files. The Store owns only:

- `state.json`: identity, Pipeline identity, Stage lifecycle, execution gate, current Interaction and correction marker;
- `decisions.jsonl`: immutable user Decision ledger;
- `tasks.jsonl`: immutable media Task/Attempt event ledger.

There is no full Production snapshot, extension tree, domain revision array, pointer graph, compatibility reader or migration layer.

`video_preview_start` is idempotent for an already-active `outputDir + productionId + Pipeline identity` in the same Bridge process and returns the existing Session. This lookup precedes Pipeline package rereading, so removal of an old installed-plugin cache directory cannot strand an active Production. A different process still restores from the current installed package for the recorded Pipeline revision and must acquire the Production lock.

## Git and ownership

Git is required. Review and Stage checkpoints reject uncommitted Host-owned paths. `state.json`, both ledgers, `.production.lock`, and atomic temp files are excluded from that Host-clean test because Store changes use the checkpoint protocol. The Store verifies its in-memory state equals disk state and both ledgers are valid append-only prefixes relative to `HEAD`.

The Store maintains `refs/codex-video-production/last-seen`; current `HEAD` must fast-forward that ref. Reset/rebase history rewrites hard-block recovery/checkpoints. One live process holds `.production.lock`; stale lock reclamation occurs only on explicit restore after the recorded PID is gone.

## Decisions

An Interaction can target only committed paths. At request time the Store records current `HEAD` and each path's Git object ID in `state.json`. Browser submission is atomically persisted before wait returns. `append_decision` derives the immutable ledger row from that submitted Interaction and clears it; Host input cannot supply outcome or target hashes.

Form/select/whole approve evidence is atomic: any changed target stales the whole Decision. Target/batch review evidence is per target: only changed targets stale. Target commits must remain ancestors of `HEAD`; current object IDs must match. Restoring a path to the exact original bytes restores the object ID and reactivates its old per-target evidence.

A required-review Stage cannot complete until current evidence of the declared kind exists in committed `decisions.jsonl`.

## Tasks and Attempts

`task-created` stores operation, target path, Provider, committed `requestRef`, its object ID, optional committed `dependencyPaths` stamped with commit/object IDs, exact request snapshot, Store-computed request hash, optional redo link, Task ID, and Attempt 1 in `submitting`. This event is fsynced before a Provider call. Every Concept Storyboard Task names its matching text Proposal as a dependency, so changing those bytes invalidates that alternative. In revision 4, a Unit Storyboard `image-generation` task uses `units/<unitId>/storyboard-plan.json` as its request and stamps every Plan `referencePaths` entry as a dependency; when `assets/index.json` declares product reference images, the Plan must include one. A `video-generation` task uses `units/<unitId>/plan.json` as its request, must stamp `units/<unitId>/storyboard.png` as a dependency, and requires current per-target approval for that canonical Storyboard path. Plan changes are Host-owned and auditable but do not require a separate user Decision; Storyboard changes stale the cost authorization before another paid call. Existing revision 3 Productions retain their candidate-directory selection rule, and revisions 1/2 retain their recorded Plan-approval rule.

Attempt transitions are validated. Provider submit ID is write-once. `submission_unknown` requires reconciliation before leaving it. A success requires result evidence; failure, cancellation and reconciliation require their matching evidence. Identical polls do not append events. Retry adds an Attempt only after failed/cancelled; redo is a new Task. `artifact-unrecoverable` applies only after success and requires explicit redo.

The Bridge validates/persists events but never calls, polls, schedules, cancels, retries or redoes a Provider.

## State actions and checkpoints

`update_state` uses `expectedStateRevision` and only accepts `complete-stage`, `activate-stage`, `pause-gate`, `resume-gate`, and `reopen-from-stage`. Stage order is a complete prefix, one active Stage, and pending suffix. A paused Production has one matching gate.

Checkpoints enforce committed Manifest outputs, current review evidence, and these structural facts:

- Proposal: 3–4 unique text Proposals remain semantic authority; every direction has its own current request and whole-film Concept Storyboard with Task provenance tied to that Proposal's bytes; one select Decision atomically targets every complete image-plus-text alternative.
- Storyboard Production: safe unique Unit IDs in `structure.json`; `continuity/index.json`; one internal Storyboard Plan per Unit; candidate and byte-identical canonical whole-sheet Storyboard per Unit; successful Task or imported source; and current per-target approval of every canonical Storyboard path. A Storyboard file is one indivisible generated image; Preview never treats its drawn panels as separate artifacts.
- Unit Video Production: one internal Plan per Unit; candidate and byte-identical canonical Clip per Unit; successful video Task whose stamped dependencies include the approved current Storyboard; and, in revision 4, current per-target approval of every canonical Clip path. Revisions 1–3 retain their recorded candidate-directory selection evidence.
- Assembly: assembly/probe/final files, successful local assembly Task, exact Brief duration, probe tolerance at most one frame and 100ms, matching ratio, and final approval.

Prompts and Host self-checks own creative/domain completeness not listed above.

`complete` also requires every Stage complete except the active final Stage, no Interaction, no nonterminal Attempt, clean Host files, valid history and final checkpoint. It then marks the final Stage and Production complete.

Correction requires a committed Decision requesting change or an explicit system-failure reason. The Store reopens the selected Stage and resets the suffix lifecycle; the Host explicitly deletes/restores/rewrites files and commits them.

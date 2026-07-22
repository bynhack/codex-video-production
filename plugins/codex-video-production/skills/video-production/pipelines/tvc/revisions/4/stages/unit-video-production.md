# TVC — Unit Video Production

## Stage goal

Internally compile one evidence-backed Clip Plan per Unit, generate candidates from approved Storyboards and real references, and obtain user confirmation of one current Clip per Unit.

## Required inputs

Read `structure.json`, `continuity/index.json`, every approved Storyboard and all real relevant source assets. The Storyboard is the user's cost authorization evidence; prompt planning remains Host-owned.

## Domain instructions

Write each Plan immediately before execution. Storyboard is always `referenceImages[0]`; add only real applicable continuity and source references, preserving one-to-one numbering in the prompt. Translate the approved Storyboard into one timestamped continuous clip prompt that includes every intended internal shot/beat, cut or camera transition. Do not reduce a multi-panel Storyboard to one slow camera move, and do not pad time with static product holds, repeated motion or an extended end frame. State the opening action immediately, the ordered beat timing, visible change cadence and exact closing state; for an energetic product TVC, keep most internal shots roughly 0.8–3 seconds unless the approved Storyboard clearly specifies a deliberate longer take. For `tail-frame`, wait for the real prior approved Clip frame, store it, then finish the dependent Plan. Append `task-created` with the Plan as `requestRef` and the approved Storyboard among `dependencyPaths` before each paid call. Submit every independent Unit first, poll all Tasks together, record only Attempt state transitions, then batch-review actual videos. On invalid parameters inspect Lovart help and correct them. Retry preserves the Task request; redo creates a new Task.

## Output contract

For each Unit write `units/<unitId>/plan.json` with timing, ratio, quality, complete prompt, optional negative prompt, ordered reference arrays, `executable`, and `blockingIssues`. Store candidates in `clip-candidates/*.mp4`, selected bytes in `clip.mp4`, and any required prior frame in `tail-frame.png`. Preserve model-native and user-supplied audio only.

## Review and completion

Do not request separate Plan approval. The Store must reject a paid video Task unless its dependencies include that Unit's current approved `storyboard.png`. After candidates are ready, copy the current candidate bytes to each canonical `units/<unitId>/clip.mp4`, commit them, then request one `batch-review` targeting those canonical Clip paths in Structure order. The request must not contain task-control-only `mediaTaskId` or `allowedTaskActions`; per-target `redo` is already part of the batch-review result. Append and commit the Decision, regenerate and re-review only revised targets, and complete only when every Unit has a Plan, current approved Clip, successful Task provenance and real continuity files.

## Boundaries

Do not assemble the final film, invent references, treat Provider success as user approval, expose technical Plans as a user decision, or let Preview call Providers.

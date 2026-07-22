# Interaction Contract

## Stage views

Preview reads committed files through the Stage `view` declared in the Pipeline. It receives no content-kind payload or full Production snapshot. The page consists of a collapsed production-flow drawer, current/selected Stage file view, optional Task board, and the current Interaction. Waiting Interactions are embedded after the business content they approve; there is no duplicate technical right panel.

Current Stage is interactive. The production-flow drawer is collapsed by default. Completed Stages are available from it as read-only history; pending Stages expose only their business label and order and remain disabled, with no Stage files resolved or served. Historical navigation never changes `currentStage`, publishes, opens an Interaction or creates evidence.

Revision 4 uses `clarification-form`, `research-document`, `proposal-comparison`, `storyboard-workspace`, `clip-review`, `package-review-document`, and `final-review`. `structure-timeline` and `clip-plan-review` remain bundled only for read-only recovery of older Productions. Views render files declared by `requires/produces`; Markdown is rendered as a safe subset of headings, lists, bold text, and paragraphs with YAML front matter shown as field rows, JSON is parsed data, and media uses local URLs. Embedded Markdown HTML is never executed.

The file route only serves media first resolved by a visible Stage view. It rejects traversal, absolute paths, symlink escape, hidden/System files and unsupported MIME, and supports video byte ranges. `state.json`, ledgers and `.git` are never served as media.

## Publish

`video_preview_publish` accepts only `stage`, optional `notice`, and `focusPaths`. It is an in-memory refresh hint and carries no production content. After restart the page reconstructs from `state.json`, Pipeline and committed files.

## Interactions

Kinds are `form`, `select`, `comment`, `approve`, `target-review`, `batch-review`, and `task-control-request`. Every request declares the current `stageId`; the Store rejects any other Stage. It also declares title, optional description, committed `targetPaths`, form fields or select options, or one Task plus allowed task actions. Browser output is strict structured data:

- form: `answers` keyed by declared field ID;
- select: one declared `selection` plus optional comment;
- approve: `approve`, `revise`, or `reject` plus comment;
- target/batch: exactly one action for every stamped target path; action is `approve`, `revise`, `select`, or `redo`, with optional selected path/comment;
- task control: one declared `cancel`, `retry`, or `redo` action.

`mediaTaskId` and `allowedTaskActions` are request fields exclusive to `task-control-request`. A `target-review` or `batch-review` request must omit them; its per-target `redo` capability comes from the fixed review response contract rather than a request-side allowlist.

The HTTP handler validates and atomically stores the response in `state.json` before unblocking `wait_interaction`. It does not interpret the workflow outcome. The Host calls `append_decision` to make committed evidence.

Form fields are generated for the current request rather than selected from a fixed questionnaire. In clarification, questions are vertically stacked in the main content, `select` renders clickable pill choices, `multi-select` renders pill choices with visible checkboxes, and `text`/`textarea` remain available only when fixed choices would lose necessary information. Preview labels and summaries use business language and do not expose file paths or internal protocol names by default.

Proposal is one `select`. Before it opens, every direction already has a complete text Proposal and its own whole-film Concept Storyboard. The page presents all directions as text cards. Clicking a card both selects that option in the single embedded Interaction and replaces the detail area with only that direction's image plus complete, permanently expanded text; there is no second “choose” button. Its atomic targets cover the index and every Proposal/request/image alternative. There is no preliminary Interaction or second confirmation Interaction.

Concept and Unit Storyboards are indivisible whole images. Preview offers fit-to-width, zoom and original-file viewing, but never crops drawn panels into separate UI cards. Revision 4 does not ask the user to approve Structure, continuity/reference planning, Storyboard prompts or Clip Plans separately. `storyboard-workspace` first shows every Unit as a chronological text production card containing its timing, narrative function and visible event. Selecting one card reveals only that Unit's canonical Storyboard, its image-generation prompt and resolved reference materials. Every Unit defaults to approve; marking only a Storyboard that needs modification reveals target-specific feedback. Candidate and canonical copies are never shown twice. `clip-review` shows each approved Storyboard beside that Unit's single current `clip.mp4`; internal Task/candidate files are not displayed, and the user only approves or requests a redo with feedback. Raw paths and unrelated required files are not dumped into the page.

Preview keeps one SSE connection to receive lightweight state-change notices, then rereads the current summary and Stage View. A 30-second poll remains only as disconnect recovery. While the same Interaction remains waiting, refresh preserves the existing form DOM so unfinished input, selection, focus and cursor state are not discarded. A changed/submitted Interaction or Stage navigation renders the new server state.

`wait_interaction` waits at most 55 seconds per call; timeout returns pending and does not cancel the Interaction.

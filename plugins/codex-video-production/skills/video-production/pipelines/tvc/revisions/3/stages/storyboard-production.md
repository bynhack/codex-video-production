# TVC — Storyboard Production

## Stage goal

Internally turn the selected creative direction into executable Generation Units, establish any shared continuity references, plan one Storyboard Sheet per Unit, generate candidates and obtain user confirmation of the actual Storyboards.

## Required inputs

Read the confirmed Brief, selected complete text Proposal, whole-film Concept Storyboard and every usable source asset. The text Proposal remains semantic authority and the Concept Storyboard carries whole-film visual intent.

## Domain instructions

First write the minimum safe ordered Unit structure. Split at meaningful scene, time, subject, product-state, action, narrative-function or generation-risk changes, never mechanically into equal blocks. Units are contiguous, non-overlapping, greater than zero, at most 15000ms and sum exactly to total duration. Define `tail-frame`, `match-cut` or `reference-only` continuity. Then identify shared character, product and scene identities. Reuse real user assets when sufficient; otherwise use only `lovart-unofficial` to generate the minimum reference images before dependent Storyboards. Record even an empty reference set in `continuity/index.json`. For each Unit create one self-contained plan for one indivisible Storyboard Sheet whose dynamic panel count covers the entire Unit chronologically, with clear panel boundaries, time/beat, action, product state, camera, light and continuity. Generate all independent Units first, poll as a batch, and present actual whole-sheet candidates together. If Lovart rejects parameters, inspect its help and correct the request.

## Output contract

Write `structure.json` with exact timing and ordered Units. Write `continuity/index.json` with `references[]` entries containing stable ID, kind, path, source paths and used Unit IDs; referenced files must exist. For each Unit write `units/<unitId>/storyboard-plan.json`, candidates under `storyboard-candidates/*.png`, and copy selected bytes to `storyboard.png`. Plans include Unit timing, ratio, panel count, prompt, ordered real `referencePaths`, `continuityInputs` and empty `blockingIssues`. Do not persist derived panel crops.

## Review and completion

Commit internal structure, continuity references, plans and candidates. Request one `target-review` or `batch-review` covering every candidate directory, append and commit the Decision, then commit canonical Storyboards. Complete only when timing invariants hold, all references are real, every Unit has a current selection matching canonical bytes, and each generated candidate has successful Task provenance or byte-identical imported source. Pause video execution behind `tvc.unit-video-production@1`.

## Boundaries

Do not ask users to approve structure, reference planning or prompts separately. Do not generate video/audio, let Preview call Providers, or use any media skill other than Lovart.

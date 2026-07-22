# TVC — Video Structure

## Stage goal

Translate the selected proposal into the minimum safe set of ordered Generation Units with exact timing and explicit continuity.

## Required inputs

Read `brief.md`, `proposals/selected.json`, the selected proposal file and `proposals/concept-storyboard.png`. The complete text proposal remains semantic authority; the Concept Storyboard is visual reference only. Preserve the confirmed duration, ratio, product claims, mandatory elements and restrictions.

## Domain instructions

A Unit is one future generated Clip and one Storyboard Package, not a shot or panel. Split at meaningful scene, time, subject, product-state, action, narrative-function or generation-risk changes; never mechanically divide into equal 15-second blocks. Use integer millisecond intervals from zero, contiguous and non-overlapping. Every Unit must be greater than zero and at most 15000ms; durations may differ and their exact sum must equal the Brief. Define start state, visible event, end state, state change, required inputs, meaningful storyboard panel count, and one continuity mode: `tail-frame`, `match-cut`, or `reference-only`. Tail-frame means the later Plan cannot execute until the real prior approved clip frame exists.

## Output contract

Write `structure.json` with `totalDurationMs`, `aspectRatio`, rationale and ordered `units`. Each Unit contains `id`, `order`, `startMs`, `endMs`, `durationMs`, `label`, `storyFunction`, `sceneContext`, `visibleEvent`, `startState`, `endState`, `continuityMode`, `continuityNotes`, `requiredAssetPaths`, and `storyboardPanelCount`.

## Review and completion

Commit `structure.json`, request an `approve` Interaction targeting it, append and commit the Decision, and complete only when timing invariants hold and approval is current. Pause the next Stage behind `tvc.storyboard-production@1` until that capability is explicitly resumed.

## Boundaries

Do not generate media, create Provider requests, infer missing facts from the image, or replace the selected text proposal.

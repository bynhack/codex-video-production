# TVC — Storyboard Plan

## Stage goal

Create one executable Storyboard Sheet plan for every current Generation Unit.

## Required inputs

Read `structure.json`, `brief.md`, the selected text proposal, the whole-film `proposals/concept-storyboard.png` and `assets/index.json`. The text proposal defines meaning while the Concept Storyboard carries visual intent. Resolve every reference to a real contained file and preserve each Unit's duration, ratio, temporal beats, identity and continuity.

## Domain instructions

Plan one single indivisible Storyboard Sheet image per Unit. Its panels are drawn inside that one image, chronological and collectively cover the whole Unit; each panel names a time range or beat, composition, subject action, product state, camera, lighting and continuity state. Panel count comes from `storyboardPanelCount`, never a habitual fixed number. The prompt must be self-contained, demand consistent identity/product geometry across panels, clear panel boundaries, correct reading order, no UI decoration and no unwanted text. Put the whole-film Concept Storyboard and only real useful assets in ordered `referencePaths`; record continuity inputs separately and never invent a future tail frame.

## Output contract

For each Unit write `units/<unitId>/storyboard-plan.json` containing `unitId`, `durationMs`, `aspectRatio`, `panelCount`, `prompt`, ordered `referencePaths`, `continuityInputs`, and `blockingIssues`.

## Review and completion

Commit every plan. Complete without routine Review only when there is exactly one plan per current Unit, all paths exist, values match Structure and `blockingIssues` is empty.

## Boundaries

Do not call image/video tools, create candidates, alter Unit timing or write Clip Plans.

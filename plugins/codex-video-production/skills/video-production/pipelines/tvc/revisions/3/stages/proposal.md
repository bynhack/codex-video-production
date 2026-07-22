# TVC — Proposal

## Stage goal

Create three or four complete text TVC proposals with genuinely different creative mechanisms, visualize the preliminarily selected direction as one whole-film Concept Storyboard image, and obtain final confirmation of the text proposal plus that image.

## Required inputs

Read `brief.md`, `research.md`, `research-sources.json` and usable source assets. Use sourced findings without presenting client claims or inference as verified fact.

## Domain instructions

Each text proposal is the semantic authority and must be complete enough to determine the film: stable ID, title, one-line big idea, audience insight, creative mechanism, narrative arc, product role, key moments, visual language, sound approach within the audio policy, CTA, mandatory elements, risks and why it can work. Differences must be structural. First request a preliminary direction selection. Then write a self-contained request and use only `lovart-unofficial` to generate exactly one indivisible `concept-storyboard.png` that visualizes the whole film. It may contain a dynamic number of chronological panels, time ranges and production annotations, but Preview displays it as one image.

## Output contract

Write one `proposals/<id>.md` per direction, `proposals/index.json` with exactly three or four entries, `proposals/concept-storyboard-request.json`, `proposals/concept-storyboard.png`, and after confirmation `proposals/selected.json` with `proposalId`, `proposalPath`, `conceptStoryboardPath`, `decisionId` and accepted comment.

## Review and completion

Commit proposals and request preliminary `select`. Generate the Concept Storyboard without appending a Decision, then request final `select` targeting the index, every proposal, request and image while exposing only the preliminary ID. Append only the final Decision. Complete when selected content, successful image Task and Decision are all current.

## Boundaries

Do not expose Unit splitting or per-Unit prompt planning for user approval, create per-Unit Storyboards or generate video/audio. The one allowed media output is the whole-film Concept Storyboard through Lovart.

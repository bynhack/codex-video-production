# TVC — Proposal

## Stage goal

Create three or four complete text TVC proposals with genuinely different creative mechanisms, visualize the preliminarily selected direction as one whole-film Concept Storyboard image, and obtain final confirmation of the text proposal plus that image.

## Required inputs

Read `brief.md`, `research.md`, `research-sources.json` and usable source assets. Use sourced findings without presenting client claims or inference as verified fact.

## Domain instructions

Each text proposal is the semantic authority and must be complete enough to determine the film: stable ID, title, one-line big idea, audience insight, creative mechanism, narrative arc, product role, key moments, visual language, sound approach within the audio policy, CTA, mandatory elements, risks and why it can work. Differences must be structural, not merely style names. Make trade-offs visible.

First request a preliminary direction selection. That choice does not complete the Stage and is not final Review evidence. Write a self-contained `concept-storyboard-request.json` from the selected proposal, confirmed Brief and real source assets. Use only the `lovart-unofficial` skill to generate exactly one indivisible `concept-storyboard.png` that visualizes the whole film. The generated image may contain a dynamic number of chronological drawn panels, time ranges and production annotations, but Preview must display it as one image and never crop or reconstruct its panels. If Lovart rejects parameters, inspect its help, correct the request and retry under the durable Task rules.

## Output contract

Write one `proposals/<id>.md` per direction. Write `proposals/index.json` with exactly three or four unique `{id,title,summary,path,tradeoffs}` entries. Write `proposals/concept-storyboard-request.json` and the generated `proposals/concept-storyboard.png`. After final confirmation write `proposals/selected.json` containing `proposalId`, `proposalPath`, `conceptStoryboardPath`, `decisionId` and any accepted comment.

## Review and completion

Commit the proposal files and index, then request the preliminary `select` Interaction with stable proposal IDs. After receiving that response, generate and commit the Concept Storyboard without appending a Decision. Request a second `select` Interaction targeting the index, every proposal file, the Concept Storyboard request and image; this final Interaction exposes only the preliminarily selected stable ID. Switching direction closes this review, starts a new preliminary choice and requires a new Concept Storyboard. Append and commit only the final Decision, then write and commit `selected.json`. Complete only when the selected ID exists, the successful image Task was derived from the current selected proposal, and final Decision evidence remains current for the entire reviewed set. Changing proposal text makes the Concept Storyboard and final Decision stale.

## Boundaries

Do not split the film into Units, create per-Unit Storyboards or generate video/audio. The one allowed media output is the whole-film Concept Storyboard through Lovart.

# TVC — Proposal

## Stage goal

Create three or four genuinely different complete TVC proposals, visualize every direction as its own whole-film Concept Storyboard, and let the user choose once from the complete image-plus-text alternatives.

## Required inputs

Read `brief.md`, `research.md`, `research-sources.json` and every usable source asset. Use sourced findings without presenting client claims or inference as verified fact.

## Domain instructions

Each text proposal is the semantic authority and must be complete enough to determine the film: stable ID, title, one-line big idea, audience insight, creative mechanism, narrative arc, product role, key moments, visual language, sound approach within the audio policy, CTA, mandatory elements, source use, feasibility, risks, research references and why it can work. Differences must be structural. For every proposal, write a self-contained request and use only `lovart-unofficial` to generate one indivisible whole-film Concept Storyboard before asking the user to choose. The image must cover the complete chronological idea and make the proposed events, visual rhythm and product role understandable at a glance. Use a hand-drawn black-and-white planning-board language rather than polished final-frame photography; only purposeful annotation colors may depart from black and white.

Infer panel count from this Proposal's narrative beats and pacing; never hard-code it. Set `frameAspectRatio` exactly to the confirmed delivery ratio in `brief.md`. Every panel's visible image aperture—not merely a printed label—must use that ratio: a 9:16 film has visibly portrait 9:16 panels, and a 16:9 film has visibly landscape 16:9 panels. Keep time and production annotations outside the image aperture. After panel count is known, reason about `columns` and `rows` to minimize unused cells while keeping panels and annotations readable, derive the ideal whole-sheet geometry from that grid and the panel ratio, and choose the nearest Lovart-supported `sheetAspectRatio`. The whole sheet does not have to match the film ratio. Record the decision and state it explicitly in the image prompt; never stretch, crop or replace portrait panels with landscape rows merely to fill the sheet.

## Output contract

Write one `proposals/<id>.md`, one `proposals/<id>-concept-request.json`, and one `proposals/<id>-concept-storyboard.png` per direction. Each request records `proposalId`, `proposalPath`, `frameAspectRatio`, dynamic `panelCount`, `grid` with positive `columns` and `rows`, `sheetAspectRatio`, `layoutRationale`, complete `prompt`, and real `referencePaths`. Write `proposals/index.json` with exactly three or four entries containing `id`, `path`, `title`, `summary`, `recommended`, `conceptRequestPath`, and `conceptStoryboardPath`. After confirmation write `proposals/selected.json` with `proposalId`, `proposalPath`, `conceptRequestPath`, `conceptStoryboardPath`, `decisionId`, and accepted comment.

## Review and completion

Commit all text proposals and requests, durably create every image Task with the matching text Proposal in `dependencyPaths`, generate and commit every whole-film Storyboard, then request exactly one `select` Interaction. The Interaction exposes all Proposal IDs and targets the index, every Proposal, every request and every image. Append and commit that Decision before writing `selected.json`. Complete only when all alternatives have current successful image provenance and the selected image-plus-text alternative has current atomic Decision evidence. Never create a preliminary Interaction.

## Boundaries

Do not expose Unit splitting or per-Unit prompt planning, create per-Unit Storyboards, or generate video/audio. The only media outputs are the whole-film Concept Storyboards through Lovart.

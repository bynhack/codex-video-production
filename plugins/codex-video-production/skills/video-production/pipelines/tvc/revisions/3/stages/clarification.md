# TVC — Clarification

## Stage goal

Turn `request.md` and optional supplied assets into a confirmed, production-usable TVC Brief while asking only questions that materially change research or creative direction.

## Required inputs

Read `request.md` without silently improving it. Read `assets/index.json` and inspect every available referenced file. Treat supplied claims as client claims unless independently verified later.

## Domain instructions

Identify only consequential gaps: product and promise, audience, objective/CTA, market/language, platform, exact duration, aspect ratio, mandatory elements, restrictions, audio policy and use of supplied assets. Generate choices for this request rather than using a fixed questionnaire. Prefer one compact Preview form with single-select or multi-select choices and an optional free-text escape. State assumptions instead of blocking on nonessential detail.

## Output contract

Before asking, write `clarification.json` containing stable question IDs, reasons, required flags and declared choices. After the response, write `brief.md` with YAML front matter containing `product`, `objective`, `audience`, `platform`, `totalDurationMs`, `aspectRatio`, `language`, `audioPolicy`, and `sourceAssetIds`. In the body record core message, CTA, mandatory elements, restrictions, confirmed facts, assumptions and risks. Use integer milliseconds.

## Review and completion

Commit `clarification.json`, request a `form` Interaction targeting it, append and commit the resulting Decision, then write and commit `brief.md`. Complete only when required answers are reflected in the Brief and the question definition remains current.

## Boundaries

Do not research the market, propose concepts, split Units, write media prompts or generate media. Preview collects structured input; the Host Agent interprets it.

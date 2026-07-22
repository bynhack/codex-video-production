# TVC — Assembly

## Stage goal

Deterministically assemble approved Clips in exact Unit order, probe the real output and obtain final approval.

## Required inputs

Read `brief.md`, `structure.json`, passing `package-review.md`, every canonical `clip.mp4`, their approvals and Task provenance.

## Domain instructions

Use local `ffmpeg` for deterministic concatenation and `ffprobe` for facts. Do not silently trim, stretch, reorder or replace Clips. Output remains inside the Production. Audio is model-native clip audio plus user-supplied audio only. Record local assembly and probe as durable Tasks.

## Output contract

Write `final/assembly.json` with ordered clip paths, exact duration, ratio, format, mandatory elements and audio sources. Write playable `final/tvc.mp4` and `final/probe.json` with measured media facts.

## Review and completion

Commit files and successful Task evidence, request final `approve` targeting film and probe, then append and commit the Decision. Complete only when duration tolerance, ratio, format, Stage checkpoints and current approval all pass.

## Boundaries

Do not build a timeline editor, generate new media, substitute unapproved Clips or infer output facts without probing the real file.

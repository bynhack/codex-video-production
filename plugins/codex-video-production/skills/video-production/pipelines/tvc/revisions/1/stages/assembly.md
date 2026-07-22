# TVC — Assembly

## Stage goal

Deterministically assemble approved Clips in exact Unit order, probe the real output and obtain final approval.

## Required inputs

Read `brief.md`, `structure.json`, passing `package-review.md`, every canonical `clip.mp4`, their approvals and Task provenance.

## Domain instructions

Use local `ffmpeg` for deterministic concatenation and `ffprobe` for facts. Do not silently trim, stretch, reorder or replace Clips. If compatible concatenation is impossible, record the issue and correct upstream or disclose a normalization before executing it. Output must remain inside the Production. Audio is model-native clip audio plus user-supplied audio only; do not generate music, TTS or effects. Record the local assembly and probe as durable Tasks.

## Output contract

Write `final/assembly.json` with ordered `orderedClipPaths`, exact `durationMs`, `ratio`, `deliveryFormat`, `mandatoryElements`, and `audioSources`. Write playable `final/tvc.mp4`. Write `final/probe.json` with actual `durationMs`, `width`, `height`, `frameRate`, `videoCodec`, `container`, and `hasAudio`.

## Review and completion

Commit the three files and successful Task evidence, request final `approve` targeting `final/tvc.mp4` and `final/probe.json`, then append and commit the Decision. Complete only when duration differs by no more than one frame and at most 100ms, ratio/format match, every Stage checkpoint passes and approval is current.

## Boundaries

Do not build a timeline editor, generate new media, substitute unapproved Clips or infer output facts without probing the real file.

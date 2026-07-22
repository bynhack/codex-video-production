# TVC — Video Prompt Plan

## Stage goal

Compile one Provider-ready, evidence-backed Clip Plan per Unit without submitting media.

## Required inputs

Read `structure.json`, the approved Storyboard for each Unit and real relevant source assets. Preserve exact duration, ratio, continuity, mandatory elements and negative constraints.

## Domain instructions

Storyboard is always `referenceImages[0]`. Add only real references needed by the Unit and preserve call order. Every `[图片N]`, `[视频N]` and `[音频N]` token in the prompt maps one-to-one to the corresponding ordered array. Audio references are limited to user-supplied audio. For `tail-frame`, require the real previous approved clip tail-frame; while absent, record the blocker and `executable: false`. When it arrives, rewrite and recommit the Plan, and obtain new approval before any paid video task. Never silently generate reference-free.

## Output contract

For each Unit write `units/<unitId>/plan.json` containing `unitId`, `durationMs`, `ratio`, `quality`, complete `prompt`, optional `negativePrompt`, ordered `referenceImages`, `referenceVideos`, `referenceAudios`, `executable`, and `blockingIssues`.

## Review and completion

Commit Plans and request `approve` or batch review targeting every current Plan. Append and commit the Decision. Complete when all immediately executable Plans are approved and deferred tail-frame blockers are explicit; a changed Plan always requires new current evidence.

## Boundaries

Do not change Structure or Storyboards, invent references, generate audio, or submit video.

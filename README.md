# Codex Video Production

An installable Codex plugin for producing and reviewing complete TVC ads through a local browser Preview. Codex remains the only reasoning and orchestration runtime.

## Install

Requirements:

- Codex CLI/Desktop
- Node.js 20 or newer
- Git and ffmpeg
- the `lovart-unofficial` skill configured for media generation

```bash
codex plugin marketplace add bynhack/codex-video-production --ref main
codex plugin add codex-video-production@video-production
codex mcp list
```

`codex mcp list` should show the enabled `video-preview` server. Start a new Codex task and invoke `$video-production`.

## Update

```bash
codex plugin marketplace upgrade video-production
codex plugin add codex-video-production@video-production
```

Start a new Codex task after updating so the new plugin snapshot is loaded.

## Scope

The plugin provides a declarative TVC pipeline, production prompts, durable local state, and a browser review surface. It does not embed another agent runtime or media provider.

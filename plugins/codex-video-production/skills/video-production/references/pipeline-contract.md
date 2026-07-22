# Pipeline Contract

## Identity and layout

Relative to the directory containing `SKILL.md`, the default installed Pipeline is `pipelines/tvc/revisions/4/pipeline.yaml`. A declaration contains `id`, positive integer `version`, positive integer `revision`, and exact `manifestRef`. Stage Prompt content may be updated in the current revision when its `promptVersion` is increased. Changes to Stage order, IDs, views, requires/produces, review rules or other Pipeline structure require a new revision directory. A running Production keeps its installed Plugin snapshot; a Production restored after a Plugin update uses the latest Prompt content and version packaged for its recorded Pipeline revision. Revisions 1–3 remain packaged only so an existing Production can recover against its recorded declaration.

Only `tvc` is packaged. There is no Pipeline migration or legacy Pipeline reader.

Revision 4 exposes seven ordered user stages: clarification, research, proposal, storyboard-production, unit-video-production, package-review, and assembly. Video structure, continuity/reference planning and Storyboard prompting are internal work inside storyboard-production. Clip prompt planning is internal work inside unit-video-production. Internal files remain committed and auditable but do not create separate user review Stages.

## Manifest

The Manifest is strict and contains `version`, `revision`, `id`, `title`, `description`, and an ordered nonempty `stages` array. Every Stage contains:

```yaml
- id: proposal
  label: 策划提案
  goal: 形成并选择一个方向
  view: proposal-comparison
  prompt: stages/proposal.md
  promptVersion: 5
  requires: [brief.md, research.md]
  produces: [proposals/index.json, proposals/*.md, proposals/*-concept-request.json, proposals/*-concept-storyboard.png, proposals/selected.json]
  review: { kind: select, required: true }
  optional: false
```

Paths are canonical safe relative paths. `*` matches one path segment. Unknown fields, duplicate IDs/paths, absolute paths, traversal, backslashes and optional Stages are rejected. The Manifest cannot contain `next`, tools, branches, conditions, retry, Provider or execution instructions.

Review kinds are `none`, `form`, `select`, `comment`, and `approve`. `none` cannot be required. Target/batch review is an Interaction presentation of an approve checkpoint, not a Pipeline branch.

## Stage Prompt

Every prompt has one level-one title and exactly these level-two headings in order:

1. `Stage goal`
2. `Required inputs`
3. `Domain instructions`
4. `Output contract`
5. `Review and completion`
6. `Boundaries`

Prompts use Host-Agent-neutral language, name ordinary output files, and contain domain reasoning only. They cannot introduce a workflow engine or let Preview/Bridge execute a Stage.

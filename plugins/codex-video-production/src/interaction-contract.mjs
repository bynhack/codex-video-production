import { z } from "zod";

export const formFieldTypeSchema = z.enum(["text", "textarea", "select", "multi-select"]);
export const taskActionSchema = z.enum(["cancel", "retry", "redo"]);
export const reviewActionSchema = z.enum(["approve", "revise", "select", "redo"]);
const optionSchema = z.strictObject({ id: z.string().min(1), label: z.string().min(1), description: z.string().optional() });
const fieldSchema = z.strictObject({
  id: z.string().min(1), label: z.string().min(1), type: z.enum(["text", "textarea", "select", "multi-select"]),
  required: z.boolean().default(true), options: z.array(optionSchema).default([])
});

export const interactionSchema = z.strictObject({
  id: z.string().min(1).optional(),
  stageId: z.string().min(1),
  kind: z.enum(["form", "select", "comment", "approve", "target-review", "batch-review", "task-control-request"]),
  title: z.string().min(1),
  description: z.string().optional(),
  targetPaths: z.array(z.string().min(1)).default([]),
  fields: z.array(fieldSchema).default([]),
  options: z.array(optionSchema).default([]),
  mediaTaskId: z.string().min(1).optional(),
  allowedTaskActions: z.array(taskActionSchema).default([])
}).superRefine((interaction, context) => {
  if (interaction.kind === "task-control-request") {
    if (!interaction.mediaTaskId || !interaction.allowedTaskActions.length) context.addIssue({ code: "custom", message: "task control requires one task and actions" });
    if (interaction.targetPaths.length) context.addIssue({ code: "custom", message: "task control does not accept target paths" });
  } else if (!interaction.targetPaths.length) {
    context.addIssue({ code: "custom", path: ["targetPaths"], message: "interaction requires committed target paths" });
  }
  if (interaction.kind === "form" && !interaction.fields.length) context.addIssue({ code: "custom", message: "form requires fields" });
  if (interaction.kind === "select" && !interaction.options.length) context.addIssue({ code: "custom", message: "select requires options" });
  if (interaction.kind !== "task-control-request" && (interaction.mediaTaskId || interaction.allowedTaskActions.length)) {
    context.addIssue({
      code: "custom",
      message: "mediaTaskId and allowedTaskActions are only valid for task-control-request; target-review and batch-review already return per-target redo actions"
    });
  }
});

export const requestInteractionInputSchema = z.strictObject({ sessionId: z.string().min(1), interaction: interactionSchema });

const responseSchema = z.strictObject({
  selection: z.string().nullable().default(null),
  comment: z.string().default(""),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  action: z.enum(["approve", "revise", "reject"]).optional(),
  actions: z.array(z.strictObject({
    path: z.string().min(1),
    action: reviewActionSchema,
    selectedPath: z.string().min(1).optional(),
    comment: z.string().default("")
  })).default([]),
  taskAction: taskActionSchema.optional()
});

export function parseInteractionResponse(interaction, input) {
  const response = responseSchema.parse(input);
  const clean = {
    selection: response.selection,
    comment: response.comment.trim(),
    answers: Object.fromEntries(Object.entries(response.answers).map(([key, value]) => [key, Array.isArray(value)
      ? [...new Set(value.map((item) => item.trim()).filter(Boolean))]
      : value.trim()])),
    ...(response.action ? { action: response.action } : {}),
    ...(response.taskAction ? { taskAction: response.taskAction } : {}),
    actions: response.actions.map((action) => ({ ...action, comment: action.comment.trim() }))
  };
  if (interaction.kind === "form" && !Object.keys(clean.answers).length) throw new Error("form response requires answers");
  if (interaction.kind === "form") {
    const fields = new Map(interaction.fields.map((field) => [field.id, field]));
    if (Object.keys(clean.answers).some((id) => !fields.has(id))) throw new Error("form response contains an unknown field");
    for (const field of interaction.fields) {
      const answer = clean.answers[field.id];
      if (field.required && (!answer || (Array.isArray(answer) && !answer.length))) throw new Error(`${field.label} is required`);
      const values = Array.isArray(answer) ? answer : answer ? [answer] : [];
      if (["select", "multi-select"].includes(field.type) && values.some((value) => !field.options.some((option) => option.id === value))) throw new Error(`${field.label} has an invalid option`);
    }
  }
  if (interaction.kind === "select" && (!clean.selection || !interaction.options.some((option) => option.id === clean.selection))) throw new Error("select response requires a declared selection");
  if (interaction.kind === "approve" && !clean.action) throw new Error("approve response requires an action");
  if (["target-review", "batch-review"].includes(interaction.kind)) {
    const declared = new Set(interaction.targets.map((target) => target.path));
    if (clean.actions.length !== declared.size || new Set(clean.actions.map((action) => action.path)).size !== declared.size || clean.actions.some((action) => !declared.has(action.path))) {
      throw new Error(`${interaction.kind} must cover every declared target exactly once`);
    }
  } else if (clean.actions.length) throw new Error(`${interaction.kind} does not accept target actions`);
  if (interaction.kind === "task-control-request" && !interaction.allowedTaskActions.includes(clean.taskAction)) throw new Error("task action is not allowed");
  if (interaction.kind !== "task-control-request" && clean.taskAction) throw new Error(`${interaction.kind} does not accept a task action`);
  return clean;
}

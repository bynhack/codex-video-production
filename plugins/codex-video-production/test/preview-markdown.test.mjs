import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../preview/markdown.js";

test("preview markdown separates front matter and keeps markup as inert text", () => {
  const parsed = parseMarkdown(`---\nid: proposal-a\ntitle: "年轻新品"\n---\n# 核心方向\n\n这是 **重点** 与 <script>alert(1)</script>。\n\n- 第一项\n- 第二项`);
  assert.deepEqual(parsed.fields, [{ key: "id", value: "proposal-a" }, { key: "title", value: "年轻新品" }]);
  assert.deepEqual(parsed.blocks, [
    { type: "heading", level: 1, text: "核心方向" },
    { type: "paragraph", text: "这是 **重点** 与 <script>alert(1)</script>。" },
    { type: "ul", items: ["第一项", "第二项"] }
  ]);
});

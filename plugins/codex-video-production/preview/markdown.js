export function parseMarkdown(source = "") {
  const lines = String(source).replaceAll("\r\n", "\n").split("\n");
  const fields = [];
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      let current;
      for (const line of lines.slice(1, end)) {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (match) {
          current = { key: match[1], value: match[2].replace(/^(['"])(.*)\1$/, "$2") };
          fields.push(current);
        } else if (current && line.trim()) current.value += ` ${line.trim()}`;
      }
      start = end + 1;
    }
  }

  const blocks = [];
  for (let index = start; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); index += 1; continue; }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const type = unordered ? "ul" : "ol";
      const items = [];
      while (index < lines.length) {
        const match = type === "ul" ? lines[index].match(/^\s*[-*+]\s+(.+)$/) : lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]); index += 1;
      }
      blocks.push({ type, items }); continue;
    }
    const paragraph = [line.trim()]; index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index]) && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index])) {
      paragraph.push(lines[index].trim()); index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return { fields, blocks };
}

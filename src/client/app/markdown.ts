import { BaseNode, h, fragment } from "solid-vanilla";

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

const heading = /^(#{1,6})\s+(.*)$/;
const bulletItem = /^\s*[-*]\s+(.*)$/;
const orderedItem = /^\s*(\d+)\.\s+(.*)$/;
const codeFence = /^```/;
const quote = /^>\s?(.*)$/;
const ruler = /^\s*(-{3,}|\*{3,})\s*$/;

const inlineNodes = (text: string): (BaseNode | string)[] =>
  text
    .split(inlinePattern)
    .filter((part) => part)
    .map((part) => {
      if (part.startsWith("**") && part.length > 4 && part.endsWith("**")) {
        return h("b").inner(part.slice(2, -2));
      }
      if (part.startsWith("*") && part.length > 2 && part.endsWith("*")) {
        return h("i").inner(part.slice(1, -1));
      }
      if (part.startsWith("`") && part.length > 2 && part.endsWith("`")) {
        return h("code")
          .css("font-family", "monospace")
          .css("background-color", "#555")
          .css("padding", "0 0.25rem")
          .css("border-radius", "3px")
          .inner(part.slice(1, -1));
      }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        return h("a")
          .attr("href", link[2])
          .attr("target", "_blank")
          .css("color", "#4d9fff")
          .inner(link[1]);
      }
      return part;
    });

const codeBlock = (code: string) =>
  h("pre")
    .css("font-family", "monospace")
    .css("font-size", "0.9rem")
    .css("background-color", "#1e1e1e")
    .css("padding", "0.75rem")
    .css("border-radius", "5px")
    .css("overflow-x", "auto")
    .inner(code);

export const Markdown = (source: string): BaseNode => {
  const blocks: BaseNode[] = [];
  const lines = source.split("\n");
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      blocks.push(h("p").inner(...inlineNodes(para.join(" "))));
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (codeFence.test(line)) {
      flush();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !codeFence.test(lines[i]))
        buf.push(lines[i++]);
      blocks.push(codeBlock(buf.join("\n")));
      continue;
    }

    const hm = heading.exec(line);
    if (hm) {
      flush();
      blocks.push(h(`h${hm[1].length}`).inner(...inlineNodes(hm[2])));
      continue;
    }

    if (ruler.test(line)) {
      flush();
      blocks.push(
        h("hr")
          .css("border", "none")
          .css("border-top", "1px solid #666")
          .css("margin", "1rem 0"),
      );
      continue;
    }

    if (bulletItem.test(line) || orderedItem.test(line)) {
      flush();
      const ordered = orderedItem.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const match = ordered
          ? orderedItem.exec(lines[i])
          : bulletItem.exec(lines[i]);
        if (!match) break;
        items.push(ordered ? match[2] : match[1]);
        i++;
      }
      i--;
      blocks.push(
        h(ordered ? "ol" : "ul")
          .css("padding-left", "1.5rem")
          .css("margin", "0.25rem 0")
          .inner(...items.map((item) => h("li").inner(...inlineNodes(item)))),
      );
      continue;
    }

    const qm = quote.exec(line);
    if (qm) {
      flush();
      const buf = [qm[1]];
      while (i + 1 < lines.length) {
        const next = quote.exec(lines[i + 1]);
        if (!next) break;
        buf.push(next[1]);
        i++;
      }
      blocks.push(
        h("blockquote")
          .css("border-left", "3px solid #666")
          .css("margin", "0.25rem 0")
          .css("padding", "0.25rem 0.75rem")
          .css("color", "#bbb")
          .inner(...inlineNodes(buf.join(" "))),
      );
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    para.push(line.trim());
  }
  flush();

  return fragment().inner(...blocks);
};

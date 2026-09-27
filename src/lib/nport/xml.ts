// Small, bounded XML reader for EDGAR's element/attribute data, not HTML.
// Reject DTDs/entities rather than resolving external resources or expanding input.
export type XmlNode = { name: string; qualifiedName: string; attributes: Record<string, string>; children: XmlNode[]; text: string };
function decode(value: string): string {
  return value.replace(/&([^;]+);/g, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[entity]) return named[entity];
    const number = /^#x[\da-f]+$/i.test(entity) ? parseInt(entity.slice(2), 16) : /^#\d+$/.test(entity) ? Number(entity.slice(1)) : NaN;
    if (!Number.isInteger(number) || number <= 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) throw new Error("Invalid XML entity");
    return String.fromCodePoint(number);
  });
}
export function readXml(xml: string): XmlNode {
  if (xml.length > 32 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsafe or oversized XML");
  const root: XmlNode = { name: "#document", qualifiedName: "#document", attributes: {}, children: [], text: "" };
  const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g;
  let cursor = 0;
  let count = 0;
  for (const token of xml.matchAll(tokens)) {
    if (token.index !== cursor || ++count > 1000000) throw new Error("Malformed XML");
    const text = token[0]; cursor += text.length;
    const parent = stack[stack.length - 1];
    if (text.startsWith("<?") || text.startsWith("<!--")) continue;
    if (text.startsWith("<![CDATA[")) { parent.text += text.slice(9, -3); continue; }
    if (text.startsWith("</")) {
      if (stack.length === 1 || text.slice(2, -1).trim() !== parent.qualifiedName) throw new Error("Mismatched XML element");
      stack.pop();
    } else if (text.startsWith("<")) {
      const match = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*)(\/?)>$/.exec(text);
      if (!match || stack.length > 64) throw new Error("Malformed XML element");
      const node: XmlNode = { name: match[1].split(":").pop()!, qualifiedName: match[1], attributes: {}, children: [], text: "" };
      for (const attr of match[2].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        const key = attr[1].split(":").pop()!;
        if (Object.hasOwn(node.attributes, key)) throw new Error("Duplicate XML attribute");
        Object.defineProperty(node.attributes, key, { value: decode(attr[2] ?? attr[3]), enumerable: true });
      }
      parent.children.push(node);
      if (!match[3]) stack.push(node);
    } else parent.text += decode(text);
  }
  if (cursor !== xml.length || stack.length !== 1 || root.children.length !== 1 || root.text.trim()) throw new Error("Incomplete XML");
  return root.children[0];
}
export function child(node: XmlNode, name: string): XmlNode | undefined {
  const matches = node.children.filter(item => item.name === name);
  if (matches.length > 1) throw new Error(`Ambiguous XML ${name}`);
  return matches[0];
}
export function required(node: XmlNode, name: string): XmlNode {
  const result = child(node, name);
  if (!result) throw new Error(`Missing XML ${name}`);
  return result;
}
export const value = (node: XmlNode, name: string) => child(node, name)?.text.trim() ?? "";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X"
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Index just past the `>` that closes the tag opening at `start`, skipping `>` inside quoted attributes. */
function tagEnd(text: string, start: number): number {
  let quote: string | null = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index + 1;
    }
  }
  return -1;
}

/**
 * The service-desk "Svc Options" column holds a form as XML. The chosen Request Type is the
 * text right after the opening `<select id="RequestType" ...>` tag, before its `<option>` list.
 */
export function readRequestType(svcOptions: string): string {
  let start = svcOptions.indexOf("<select");
  while (start !== -1) {
    const end = tagEnd(svcOptions, start);
    if (end === -1) return "";
    const tag = svcOptions.slice(start, end);
    if (/\bid\s*=\s*["']RequestType["']/.test(tag)) {
      const next = svcOptions.indexOf("<", end);
      const text = svcOptions.slice(end, next === -1 ? undefined : next);
      return decodeEntities(text).replace(/\s+/g, " ").trim();
    }
    start = svcOptions.indexOf("<select", end);
  }
  return "";
}

export function isMergeRequestType(requestType: string): boolean {
  return requestType.replace(/\s+/g, " ").trim().toLowerCase() === "merge request";
}

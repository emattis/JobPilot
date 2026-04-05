/**
 * Shared JSON parsing utilities for Gemini AI responses.
 *
 * Gemini (especially the thinking model) sometimes emits literal control
 * characters — actual newlines, tabs, carriage returns — inside JSON string
 * values, which makes JSON.parse throw "Bad control character in string
 * literal". This module handles that by running a state-machine sanitizer
 * before parsing.
 */

/**
 * Walk through the raw string tracking JSON string boundaries.
 * Inside a string literal, replace unescaped control characters with their
 * proper JSON escape sequences. Outside strings, leave the text alone.
 */
function sanitizeControlChars(raw: string): string {
  const out: string[] = [];
  let inString = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (ch === "\\") {
        // Escape sequence — copy the backslash and the next char verbatim
        out.push(ch);
        i++;
        if (i < raw.length) out.push(raw[i]);
      } else if (ch === '"') {
        // End of string
        inString = false;
        out.push(ch);
      } else {
        const code = ch.charCodeAt(0);
        if (code < 0x20) {
          // Control character that must be escaped inside a JSON string
          switch (ch) {
            case "\n": out.push("\\n");  break;
            case "\r": out.push("\\r");  break;
            case "\t": out.push("\\t");  break;
            default:
              out.push(`\\u${code.toString(16).padStart(4, "0")}`);
          }
        } else {
          out.push(ch);
        }
      }
    } else {
      if (ch === '"') {
        inString = true;
        out.push(ch);
      } else {
        out.push(ch);
      }
    }
  }

  return out.join("");
}

/**
 * Strip markdown code fences and extract the outermost JSON object or array.
 */
function extractRawJson(raw: string, root: "{" | "["): string {
  const close = root === "{" ? "}" : "]";
  const trimmed = raw.trim();

  // Strategy 1: strip opening ``` / ```json fence
  if (trimmed.startsWith("```")) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, "");
    const withoutClose = withoutOpen.replace(/\s*```\s*$/, "");
    if (withoutClose.includes(root)) return withoutClose.trim();
  }

  // Strategy 2: extract content from fenced block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1].includes(root)) return fenced[1].trim();

  // Strategy 3: slice from first root char to last close char
  const start = trimmed.indexOf(root);
  const end = trimmed.lastIndexOf(close);
  if (start !== -1 && end !== -1 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

/**
 * Parse a JSON object from a raw Gemini response string.
 * Handles markdown fences and unescaped control characters.
 */
export function parseAiObject<T = unknown>(raw: string): T {
  const extracted = extractRawJson(raw, "{");
  const sanitized = sanitizeControlChars(extracted);
  return JSON.parse(sanitized) as T;
}

/**
 * Parse a JSON array from a raw Gemini response string.
 * Handles markdown fences and unescaped control characters.
 */
export function parseAiArray<T = unknown>(raw: string): T[] {
  const extracted = extractRawJson(raw, "[");
  const sanitized = sanitizeControlChars(extracted);
  return JSON.parse(sanitized) as T[];
}

/**
 * Minimal safe HTML templating. Interpolated values are escaped unless they are
 * already `Html` (produced by `html` or `raw`), so nested templates compose safely.
 */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export type HtmlValue = Html | string | number | boolean | null | undefined | readonly HtmlValue[];

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

export function raw(markup: string): Html {
  return new Html(markup);
}

function serialize(value: HtmlValue): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join("");
  if (value === null || value === undefined || value === false || value === true) return "";
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): Html {
  let out = strings[0] ?? "";
  values.forEach((value, index) => {
    out += serialize(value) + (strings[index + 1] ?? "");
  });
  return new Html(out);
}

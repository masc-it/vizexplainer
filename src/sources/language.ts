import path from "node:path";

const FILENAME_LANGS: Record<string, string> = { dockerfile: "docker", makefile: "make" };

/** Language id from a file name: the extension, or a well-known file name such as `Dockerfile`. */
export function languageFromFile(file: string): string {
  const base = path.basename(file).toLowerCase();
  return FILENAME_LANGS[base] ?? (path.extname(base).slice(1) || "text");
}

function tryParseJson<T>(candidate: string): T {
  const attempts = [
    candidate,
    candidate.replace(/,\s*([}\]])/g, "$1"),
    candidate.replace(/,\s*([}\]])/g, "$1")
      .replace(/([}\]"0-9]|true|false|null)\s*(\r?\n\s*")([A-Za-z_][^"\n]{0,100}"\s*:)/g, "$1,$2$3")
      .replace(/}\s*(\r?\n\s*){/g, "},$1{"),
  ];
  let lastError: unknown;
  for (const attempt of [...new Set(attempts)]) {
    try { return JSON.parse(attempt) as T; } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Invalid JSON");
}

export function extractJson<T>(value: string): T {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const firstObject = value.indexOf("{"); const lastObject = value.lastIndexOf("}");
  const firstArray = value.indexOf("["); const lastArray = value.lastIndexOf("]");
  const candidate = fenced || (firstArray >= 0 && (firstObject < 0 || firstArray < firstObject)
    ? value.slice(firstArray, lastArray + 1) : value.slice(firstObject, lastObject + 1));
  if (!candidate) throw new Error("Codex CLI did not return structured JSON.");
  return tryParseJson<T>(candidate.trim());
}

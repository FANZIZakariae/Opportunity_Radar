import path from "node:path";
import fs from "node:fs";

export const WORKSPACE_ROOT = process.cwd();
export const DATA_DIRECTORY = path.join(WORKSPACE_ROOT, "data");

export function ensureWorkspace(): void {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
}

export function workspacePath(...segments: string[]): string {
  const candidate = path.resolve(WORKSPACE_ROOT, ...segments);
  const relative = path.relative(WORKSPACE_ROOT, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path escapes the Opportunity Radar workspace.");
  return candidate;
}

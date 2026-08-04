import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WORKSPACE_ROOT } from "@/lib/workspace";
import { extractJson } from "@/lib/codex-json";

export type CodexActivity = { message: string; threadId?: string; inputTokens?: number; outputTokens?: number; timestamp: string };
export type CodexMetadata = { threadId?: string; inputTokens?: number; cachedInputTokens?: number; outputTokens?: number };
export type CodexOptions = {
  webSearch?: boolean; timeoutMs?: number; idleTimeoutMs?: number; signal?: AbortSignal;
  reasoningEffort?: "low" | "medium" | "high"; onActivity?: (activity: CodexActivity) => void;
};
export type CodexStatus = { available: boolean; authenticated: boolean; executable: string; message: string };

export function codexEnabled(): boolean {
  return process.env.OPPORTUNITY_RADAR_CODEX_ENABLED !== "false";
}

export function resolveCodexExecutable(): string {
  const configured = process.env.CODEX_CLI_PATH?.trim();
  if (configured) return configured;
  if (process.platform !== "win32") return "codex";
  const candidates: string[] = [];
  for (const entry of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) candidates.push(path.join(entry.replace(/^"|"$/g, ""), "codex.exe"));
  const home = process.env.USERPROFILE;
  if (home) {
    for (const root of [path.join(home, ".vscode", "extensions"), path.join(home, ".vscode-insiders", "extensions")]) {
      try {
        for (const directory of fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith("openai.chatgpt-")).map((entry) => entry.name).sort().reverse()) {
          candidates.push(path.join(root, directory, "bin", "windows-x86_64", "codex.exe"));
          candidates.push(path.join(root, directory, "bin", "windows-arm64", "codex.exe"));
        }
      } catch { /* VS Code extension is optional. */ }
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || "codex";
}

export function checkCodexStatus(): Promise<CodexStatus> {
  const executable = resolveCodexExecutable();
  return new Promise((resolve) => {
    const child = spawn(executable, ["login", "status"], { cwd: WORKSPACE_ROOT, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (status: CodexStatus) => { if (!settled) { settled = true; clearTimeout(timer); resolve(status); } };
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignored */ } finish({ available: true, authenticated: false, executable, message: "Codex login check timed out." }); }, 15_000);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", (error) => finish({ available: false, authenticated: false, executable, message: `Codex CLI unavailable: ${error.message}` }));
    child.on("close", (code) => {
      const message = Buffer.concat(chunks).toString("utf8").trim();
      finish({ available: code === 0, authenticated: code === 0 && /logged in/i.test(message), executable, message: message || "Codex login is required." });
    });
  });
}

async function once<T>(prompt: string, options: CodexOptions): Promise<{ data: T; metadata: CodexMetadata }> {
  if (!codexEnabled()) throw new Error("Codex CLI is disabled in .env.local.");
  if (options.signal?.aborted) throw Object.assign(new Error("Codex operation stopped by the user."), { name: "AbortError" });
  const executable = resolveCodexExecutable();
  const finalPrompt = `${prompt}\n\nReturn only compact valid JSON matching the requested structure. No markdown. Escape line breaks inside JSON strings as \\n.`;
  const useStdin = process.platform === "win32" && finalPrompt.length > 6500;
  const args = [
    "exec", "--ephemeral", "--json", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
    "--disable", "plugins", "--disable", "apps", "--disable", "multi_agent", "--sandbox", "read-only", "-C", WORKSPACE_ROOT,
    "-c", `web_search="${options.webSearch ? "live" : "disabled"}"`,
    "-c", `model_reasoning_effort="${options.reasoningEffort || "medium"}"`,
  ];
  if (process.env.OPPORTUNITY_RADAR_CODEX_MODEL?.trim()) args.push("--model", process.env.OPPORTUNITY_RADAR_CODEX_MODEL.trim());
  args.push(useStdin ? "Read the task from stdin and return only the requested compact JSON." : finalPrompt);

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: WORKSPACE_ROOT, env: process.env, windowsHide: true, stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"] });
    if (useStdin && child.stdin) child.stdin.end(finalPrompt, "utf8");
    if (!child.stdout || !child.stderr) { reject(new Error("Could not start Codex CLI with readable output streams.")); return; }
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    let pending = ""; let lastActivity = "Codex process started"; let settled = false;
    const metadata: CodexMetadata = {};
    const timeoutMs = options.timeoutMs || Number(process.env.OPPORTUNITY_RADAR_CODEX_TIMEOUT_MS || 240_000);
    const idleTimeoutMs = options.idleTimeoutMs || Number(process.env.OPPORTUNITY_RADAR_CODEX_IDLE_TIMEOUT_MS || 90_000);
    let idleTimer: NodeJS.Timeout;
    const cleanup = () => { clearTimeout(timer); clearTimeout(idleTimer); options.signal?.removeEventListener("abort", abort); };
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); try { child.kill(); } catch { /* ignored */ } reject(error); };
    const abort = () => fail(Object.assign(new Error("Codex operation stopped by the user."), { name: "AbortError" }));
    const emit = (message: string) => {
      lastActivity = message || lastActivity;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail(new Error(`Codex CLI stalled after ${Math.round(idleTimeoutMs / 1000)} seconds. Last activity: ${lastActivity}.`)), idleTimeoutMs);
      options.onActivity?.({ message: lastActivity, threadId: metadata.threadId, inputTokens: metadata.inputTokens, outputTokens: metadata.outputTokens, timestamp: new Date().toISOString() });
    };
    const timer = setTimeout(() => fail(new Error(`Codex CLI timed out after ${Math.round(timeoutMs / 1000)} seconds. Last activity: ${lastActivity}.`)), timeoutMs);
    idleTimer = setTimeout(() => fail(new Error(`Codex CLI stalled after ${Math.round(idleTimeoutMs / 1000)} seconds. Last activity: ${lastActivity}.`)), idleTimeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    emit(lastActivity);

    childStdout.on("data", (chunk) => {
      stdout.push(Buffer.from(chunk)); pending += Buffer.from(chunk).toString("utf8");
      const lines = pending.split(/\r?\n/); pending = lines.pop() || "";
      for (const line of lines.filter(Boolean)) {
        try {
          const event = JSON.parse(line) as { type?: string; thread_id?: string; item?: { type?: string; query?: string }; usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number } };
          if (event.type === "thread.started") metadata.threadId = event.thread_id;
          if (event.type === "turn.completed" && event.usage) {
            metadata.inputTokens = event.usage.input_tokens; metadata.cachedInputTokens = event.usage.cached_input_tokens; metadata.outputTokens = event.usage.output_tokens;
          }
          emit(event.item?.type === "web_search" ? `Web search${event.item.query ? `: ${event.item.query.slice(0, 100)}` : ""}` : event.item?.type || event.type || "Codex output");
        } catch { emit("Codex CLI produced output"); }
      }
    });
    childStderr.on("data", (chunk) => { stderr.push(Buffer.from(chunk)); emit("Codex diagnostic output"); });
    child.on("error", (error) => fail(new Error(`Could not start Codex CLI: ${error.message}. Run codex login first.`)));
    child.on("close", (code) => {
      if (settled) return;
      settled = true; cleanup();
      const output = Buffer.concat(stdout).toString("utf8"); const diagnostics = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) { reject(new Error(`Codex CLI failed with exit code ${code}: ${(diagnostics || output).slice(-1600)}`)); return; }
      try {
        let message = "";
        for (const line of output.split(/\r?\n/).filter(Boolean)) {
          const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string; message?: string }; thread_id?: string; usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number } };
          if (event.type === "thread.started") metadata.threadId = event.thread_id;
          if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) message = event.item.text;
          if (event.type === "item.completed" && event.item?.type === "error" && event.item.message && !/approval_policy/i.test(event.item.message)) throw new Error(event.item.message);
          if (event.type === "turn.completed" && event.usage) {
            metadata.inputTokens = event.usage.input_tokens; metadata.cachedInputTokens = event.usage.cached_input_tokens; metadata.outputTokens = event.usage.output_tokens;
          }
        }
        if (!message) throw new Error("Codex completed without an agent response.");
        resolve({ data: extractJson<T>(message), metadata });
      } catch (error) {
        reject(new Error(`Could not parse Codex response: ${error instanceof Error ? error.message : String(error)}. Diagnostics: ${diagnostics.slice(-1000)}`));
      }
    });
  });
}

export async function runCodexJson<T>(prompt: string, options: CodexOptions = {}): Promise<{ data: T; metadata: CodexMetadata }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await once<T>(attempt === 1 ? prompt : `${prompt}\n\nSTRICT RETRY: Return syntactically valid compact JSON only.`, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2 || !/parse|json|Expected|Unexpected token/i.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Codex analysis failed.");
}

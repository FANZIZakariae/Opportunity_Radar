import "server-only";
import { extractJson } from "@/lib/codex-json";
import { runCodexJson, type CodexMetadata, type CodexOptions } from "@/lib/codex";

export type LlmProvider = "codex" | "openai" | "anthropic";
export type LlmMetadata = {
  provider: LlmProvider; model: string; requestId?: string; threadId?: string;
  inputTokens?: number; cachedInputTokens?: number; outputTokens?: number;
};
export type LlmOptions = {
  timeoutMs?: number; signal?: AbortSignal; reasoningEffort?: "low" | "medium" | "high";
  jsonSchema?: Record<string, unknown>; schemaName?: string;
  onActivity?: (activity: { provider: LlmProvider; model: string; message: string; timestamp: string; requestId?: string; inputTokens?: number; outputTokens?: number }) => void;
};
export type ProviderConfiguration = {
  provider: LlmProvider; label: string; configured: boolean; active: boolean; model: string; message: string;
};

const providers: LlmProvider[] = ["codex", "openai", "anthropic"];
const endpoints = { openai: "https://api.openai.com/v1/responses", anthropic: "https://api.anthropic.com/v1/messages" } as const;

function parseProvider(value?: string): LlmProvider {
  const normalized = value?.trim().toLowerCase() || "codex";
  if (!providers.includes(normalized as LlmProvider)) throw new Error(`Unsupported LLM provider "${normalized}". Use codex, openai, or anthropic.`);
  return normalized as LlmProvider;
}

export function activeLlmProvider(): LlmProvider { return parseProvider(process.env.OPPORTUNITY_RADAR_LLM_PROVIDER); }
export function modelForProvider(provider: LlmProvider): string {
  if (provider === "openai") return process.env.OPPORTUNITY_RADAR_OPENAI_MODEL?.trim() || "gpt-5.6-terra";
  if (provider === "anthropic") return process.env.OPPORTUNITY_RADAR_ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
  return process.env.OPPORTUNITY_RADAR_CODEX_MODEL?.trim() || "Codex account default";
}
function configured(provider: LlmProvider): boolean {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY?.trim());
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return process.env.OPPORTUNITY_RADAR_CODEX_ENABLED !== "false";
}
export function llmProviderConfigurations(): ProviderConfiguration[] {
  const active = activeLlmProvider();
  return providers.map((provider) => {
    const ready = configured(provider);
    const label = provider === "codex" ? "Codex CLI" : provider === "openai" ? "OpenAI API" : "Anthropic Claude";
    const missing = provider === "openai" ? "Add OPENAI_API_KEY to .env.local." : provider === "anthropic" ? "Add ANTHROPIC_API_KEY to .env.local." : "Enable Codex and authenticate with codex login.";
    return { provider, label, configured: ready, active: provider === active, model: modelForProvider(provider), message: ready ? `${provider === active ? "Active provider" : "Available"} · ${modelForProvider(provider)}` : missing };
  });
}
function providerOrder(): LlmProvider[] {
  const primary = activeLlmProvider();
  const fallbacks = (process.env.OPPORTUNITY_RADAR_LLM_FALLBACKS || "").split(",").map((item) => item.trim()).filter(Boolean).map(parseProvider);
  return [primary, ...fallbacks].filter((provider, index, values) => values.indexOf(provider) === index);
}
function emit(options: LlmOptions, provider: LlmProvider, model: string, message: string, metadata: Partial<LlmMetadata> = {}): void {
  options.onActivity?.({ provider, model, message, requestId: metadata.requestId, inputTokens: metadata.inputTokens, outputTokens: metadata.outputTokens, timestamp: new Date().toISOString() });
}
function timeoutMs(options: LlmOptions): number {
  const value = Number(process.env.OPPORTUNITY_RADAR_LLM_TIMEOUT_MS || 240_000);
  return options.timeoutMs || (Number.isFinite(value) ? value : 240_000);
}
function maxTokens(): number {
  const value = Number(process.env.OPPORTUNITY_RADAR_LLM_MAX_OUTPUT_TOKENS || 12_000);
  return Math.max(1_000, Math.min(64_000, Number.isFinite(value) ? value : 12_000));
}
function apiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as { error?: { message?: string } | string; message?: string };
  return typeof value.error === "string" ? value.error : value.error?.message || value.message || fallback;
}
async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw Object.assign(new Error("LLM operation stopped by the user."), { name: "AbortError" });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(Object.assign(new Error("LLM operation stopped by the user."), { name: "AbortError" })); }, { once: true });
  });
}
async function post(
  provider: "openai" | "anthropic", model: string, headers: Record<string, string>, body: Record<string, unknown>, options: LlmOptions,
): Promise<{ payload: unknown; requestId?: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs(options));
    const heartbeat = setInterval(() => emit(options, provider, model, `${provider} API request is still running…`), 15_000);
    try {
      emit(options, provider, model, `${provider} API request started${attempt > 1 ? " (retry)" : ""}.`);
      const response = await fetch(endpoints[provider], { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
      const text = await response.text();
      let payload: unknown;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text.slice(0, 1_000) }; }
      if (response.ok) return { payload, requestId: response.headers.get("x-request-id") || response.headers.get("request-id") || undefined };
      const retryable = [408, 409, 429].includes(response.status) || response.status >= 500;
      const error = new Error(`${provider} API HTTP ${response.status}: ${apiError(payload, response.statusText)}`);
      if (!retryable || attempt === 2) throw error;
      lastError = error;
      emit(options, provider, model, `${provider} API is temporarily unavailable; retrying once.`);
      await wait(Math.min(15_000, Number(response.headers.get("retry-after") || 0) * 1_000 || 750 * attempt), options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw Object.assign(new Error("LLM operation stopped by the user."), { name: "AbortError" });
      const normalized = controller.signal.aborted
        ? new Error(`${provider} API timed out after ${Math.round(timeoutMs(options) / 1000)} seconds.`)
        : error;
      lastError = normalized;
      if (attempt === 2 || (normalized instanceof Error && /API HTTP/.test(normalized.message))) throw normalized;
      emit(options, provider, model, `${provider} network request failed; retrying once.`);
      await wait(750 * attempt, options.signal);
    } finally {
      clearTimeout(timer); clearInterval(heartbeat); options.signal?.removeEventListener("abort", abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} API request failed.`);
}
function portableSchema(schema?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "$schema" && key !== "format")
      .map(([key, child]) => [key, visit(child)]));
  };
  return visit(schema) as Record<string, unknown>;
}
function openAiText(payload: unknown): string {
  const response = payload as { status?: string; incomplete_details?: { reason?: string }; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }> };
  if (response.status === "incomplete") throw new Error(`OpenAI response was incomplete: ${response.incomplete_details?.reason || "unknown reason"}.`);
  if (response.output_text) return response.output_text;
  const texts = (response.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text" && item.text).map((item) => item.text as string);
  if (texts.length) return texts.join("");
  const refusal = (response.output || []).flatMap((item) => item.content || []).find((item) => item.type === "refusal")?.refusal;
  if (refusal) throw new Error(`OpenAI refused the request: ${refusal.slice(0, 800)}`);
  throw new Error("OpenAI completed without a text response.");
}
async function runOpenAi<T>(prompt: string, options: LlmOptions): Promise<{ data: T; metadata: LlmMetadata }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OpenAI is selected but OPENAI_API_KEY is missing from .env.local.");
  const model = modelForProvider("openai");
  const schema = portableSchema(options.jsonSchema);
  const format = schema ? { type: "json_schema", name: options.schemaName || "opportunity_analysis", strict: true, schema } : { type: "json_object" };
  const result = await post("openai", model, { Authorization: `Bearer ${key}` }, {
    model, store: false, reasoning: { effort: options.reasoningEffort || "medium" }, max_output_tokens: maxTokens(),
    input: [{ role: "system", content: "Follow the evidence policy exactly. Return only the requested structured result." }, { role: "user", content: prompt }],
    text: { format },
  }, options);
  const response = result.payload as { id?: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } };
  const metadata: LlmMetadata = { provider: "openai", model: response.model || model, requestId: result.requestId || response.id, inputTokens: response.usage?.input_tokens, cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens, outputTokens: response.usage?.output_tokens };
  emit(options, "openai", metadata.model, "OpenAI structured response completed.", metadata);
  return { data: extractJson<T>(openAiText(result.payload)), metadata };
}
function anthropicText(payload: unknown): string {
  const response = payload as { stop_reason?: string; content?: Array<{ type?: string; text?: string }> };
  if (response.stop_reason === "max_tokens") throw new Error("Anthropic response was incomplete because it reached max_tokens.");
  const text = (response.content || []).filter((item) => item.type === "text" && item.text).map((item) => item.text).join("");
  if (!text) throw new Error("Anthropic completed without a text response.");
  return text;
}
async function runAnthropic<T>(prompt: string, options: LlmOptions): Promise<{ data: T; metadata: LlmMetadata }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("Anthropic is selected but ANTHROPIC_API_KEY is missing from .env.local.");
  const model = modelForProvider("anthropic");
  const schema = portableSchema(options.jsonSchema);
  const result = await post("anthropic", model, { "x-api-key": key, "anthropic-version": "2023-06-01" }, {
    model, max_tokens: maxTokens(), system: "Follow the evidence policy exactly. Return only the requested structured result.",
    messages: [{ role: "user", content: prompt }],
    ...(schema ? { output_config: { format: { type: "json_schema", schema } } } : {}),
  }, options);
  const response = result.payload as { id?: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  const metadata: LlmMetadata = { provider: "anthropic", model: response.model || model, requestId: result.requestId || response.id, inputTokens: response.usage?.input_tokens, cachedInputTokens: response.usage?.cache_read_input_tokens, outputTokens: response.usage?.output_tokens };
  emit(options, "anthropic", metadata.model, "Anthropic structured response completed.", metadata);
  return { data: extractJson<T>(anthropicText(result.payload)), metadata };
}
function codexOptions(options: LlmOptions): CodexOptions {
  return { webSearch: false, timeoutMs: options.timeoutMs || timeoutMs(options), signal: options.signal, reasoningEffort: options.reasoningEffort,
    onActivity: (activity) => options.onActivity?.({ provider: "codex", model: modelForProvider("codex"), message: activity.message, requestId: activity.threadId, inputTokens: activity.inputTokens, outputTokens: activity.outputTokens, timestamp: activity.timestamp }) };
}
function codexMetadata(metadata: CodexMetadata): LlmMetadata {
  return { provider: "codex", model: modelForProvider("codex"), requestId: metadata.threadId, threadId: metadata.threadId, inputTokens: metadata.inputTokens, cachedInputTokens: metadata.cachedInputTokens, outputTokens: metadata.outputTokens };
}
async function runProvider<T>(provider: LlmProvider, prompt: string, options: LlmOptions): Promise<{ data: T; metadata: LlmMetadata }> {
  if (provider === "openai") return runOpenAi<T>(prompt, options);
  if (provider === "anthropic") return runAnthropic<T>(prompt, options);
  const result = await runCodexJson<T>(prompt, codexOptions(options));
  return { data: result.data, metadata: codexMetadata(result.metadata) };
}
export async function runLlmJson<T>(prompt: string, options: LlmOptions = {}): Promise<{ data: T; metadata: LlmMetadata }> {
  const order = providerOrder();
  const failures: string[] = [];
  for (const provider of order) {
    if (!configured(provider)) { failures.push(`${provider}: not configured`); continue; }
    try { return await runProvider<T>(provider, prompt, options); }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
      if (provider !== order.at(-1)) emit(options, provider, modelForProvider(provider), `Switching from ${provider} to the configured fallback provider.`);
    }
  }
  throw new Error(`No LLM provider completed the analysis. ${failures.join(" | ")}`);
}


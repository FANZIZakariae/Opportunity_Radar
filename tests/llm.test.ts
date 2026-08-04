import { afterEach, describe, expect, it, vi } from "vitest";
import { llmProviderConfigurations, runLlmJson } from "@/lib/llm";

const tracked = [
  "OPPORTUNITY_RADAR_LLM_PROVIDER", "OPPORTUNITY_RADAR_LLM_FALLBACKS", "OPPORTUNITY_RADAR_OPENAI_MODEL",
  "OPPORTUNITY_RADAR_ANTHROPIC_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
] as const;
const original = Object.fromEntries(tracked.map((key) => [key, process.env[key]]));
const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

afterEach(() => {
  for (const key of tracked) {
    const value = original[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe("provider-neutral LLM adapter", () => {
  it("reports the selected provider without exposing API key values", () => {
    process.env.OPPORTUNITY_RADAR_LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "secret-never-returned";
    const providers = llmProviderConfigurations();
    expect(providers.find((item) => item.provider === "openai")).toMatchObject({ active: true, configured: true });
    expect(JSON.stringify(providers)).not.toContain("secret-never-returned");
  });

  it("calls OpenAI Responses with strict JSON Schema and normalizes usage", async () => {
    process.env.OPPORTUNITY_RADAR_LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPPORTUNITY_RADAR_OPENAI_MODEL = "gpt-test";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-openai-key" });
      expect(body).toMatchObject({ model: "gpt-test", store: false, text: { format: { type: "json_schema", strict: true } } });
      expect(body.text.format.schema).toEqual(schema);
      return new Response(JSON.stringify({
        id: "resp_123", model: "gpt-test", status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
        usage: { input_tokens: 40, output_tokens: 8, input_tokens_details: { cached_tokens: 12 } },
      }), { status: 200, headers: { "x-request-id": "req_123" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runLlmJson<{ ok: boolean }>("Analyze", { jsonSchema: schema, schemaName: "test_result" });
    expect(result.data).toEqual({ ok: true });
    expect(result.metadata).toMatchObject({ provider: "openai", model: "gpt-test", requestId: "req_123", inputTokens: 40, cachedInputTokens: 12, outputTokens: 8 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls Anthropic Messages with structured output and normalizes usage", async () => {
    process.env.OPPORTUNITY_RADAR_LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.OPPORTUNITY_RADAR_ANTHROPIC_MODEL = "claude-test";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(init?.headers).toMatchObject({ "x-api-key": "test-anthropic-key", "anthropic-version": "2023-06-01" });
      expect(body).toMatchObject({ model: "claude-test", output_config: { format: { type: "json_schema", schema } } });
      return new Response(JSON.stringify({
        id: "msg_123", model: "claude-test", stop_reason: "end_turn",
        content: [{ type: "text", text: "{\"ok\":true}" }],
        usage: { input_tokens: 55, output_tokens: 9, cache_read_input_tokens: 20 },
      }), { status: 200, headers: { "request-id": "claude_req_123" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runLlmJson<{ ok: boolean }>("Analyze", { jsonSchema: schema });
    expect(result.data).toEqual({ ok: true });
    expect(result.metadata).toMatchObject({ provider: "anthropic", model: "claude-test", requestId: "claude_req_123", inputTokens: 55, cachedInputTokens: 20, outputTokens: 9 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the selected API provider has no key", async () => {
    process.env.OPPORTUNITY_RADAR_LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    await expect(runLlmJson("Analyze", { jsonSchema: schema })).rejects.toThrow("openai: not configured");
  });
});

import { saveRequestUsage, appendRequestLog, saveRequestDetail } from "@/lib/usageDb.js";
import { COLORS } from "../../utils/stream.js";
import { canonicalizeUsage } from "../../utils/usageTracking.js";

const OPTIONAL_PARAMS = [
  "temperature", "top_p", "top_k",
  "max_tokens", "max_completion_tokens",
  "thinking", "reasoning", "enable_thinking",
  "presence_penalty", "frequency_penalty",
  "seed", "stop", "tools", "tool_choice",
  "response_format", "prediction", "store", "metadata",
  "n", "logprobs", "top_logprobs", "logit_bias",
  "user", "parallel_tool_calls", "service_tier"
];

export function extractRequestConfig(body, stream) {
  const config = { messages: body.messages || [], model: body.model, stream };
  for (const param of OPTIONAL_PARAMS) {
    if (body[param] !== undefined) config[param] = body[param];
  }
  return config;
}

export function extractUsageFromResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;

  // Responses/Claude token shape
  if (responseBody.usage?.input_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.input_tokens || 0,
      completion_tokens: responseBody.usage.output_tokens || 0,
      total_tokens: responseBody.usage.total_tokens,
      cached_tokens: responseBody.usage.input_tokens_details?.cached_tokens,
      reasoning_tokens: responseBody.usage.output_tokens_details?.reasoning_tokens,
      cache_read_input_tokens: responseBody.usage.cache_read_input_tokens,
      cache_creation_input_tokens: responseBody.usage.input_tokens_details?.cache_write_tokens ??
        responseBody.usage.input_tokens_details?.cache_creation_tokens ??
        responseBody.usage.cache_creation_input_tokens,
      input_tokens_details: responseBody.usage.input_tokens_details,
      output_tokens_details: responseBody.usage.output_tokens_details,
      service_tier: responseBody.service_tier || responseBody.usage.service_tier,
      cost_usd: responseBody.usage.cost_usd,
      cost_in_usd: responseBody.usage.cost_in_usd,
      cost_in_usd_ticks: responseBody.usage.cost_in_usd_ticks
    };
  }

  // OpenAI format
  if (responseBody.usage?.prompt_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens,
      cache_creation_input_tokens: responseBody.usage.prompt_tokens_details?.cache_write_tokens ??
        responseBody.usage.prompt_tokens_details?.cache_creation_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens,
      service_tier: responseBody.service_tier || responseBody.usage.service_tier,
      cost_usd: responseBody.usage.cost_usd,
      cost_in_usd: responseBody.usage.cost_in_usd,
      cost_in_usd_ticks: responseBody.usage.cost_in_usd_ticks
    };
  }

  // Gemini format
  if (responseBody.usageMetadata) {
    const reasoningTokens = responseBody.usageMetadata.thoughtsTokenCount || 0;
    return {
      prompt_tokens: responseBody.usageMetadata.promptTokenCount || 0,
      completion_tokens: (responseBody.usageMetadata.candidatesTokenCount || 0) + reasoningTokens,
      cached_tokens: responseBody.usageMetadata.cachedContentTokenCount || 0,
      reasoning_tokens: reasoningTokens
    };
  }

  return null;
}

export function buildRequestDetail(base, overrides = {}) {
  return {
    provider: base.provider || "unknown",
    model: base.model || "unknown",
    connectionId: base.connectionId || undefined,
    timestamp: new Date().toISOString(),
    latency: base.latency || { ttft: 0, total: 0 },
    tokens: base.tokens || { prompt_tokens: 0, completion_tokens: 0 },
    request: base.request,
    providerRequest: base.providerRequest || null,
    providerResponse: base.providerResponse || null,
    response: base.response || {},
    pxpipe: base.pxpipe || undefined,
    status: base.status || "success",
    ...overrides
  };
}

// Build the "done" summary: duration, ttft, in/out tokens with cache breakdown
export function formatDoneLine({ usage, latency }) {
  const u = usage || {};
  const inTok = u.prompt_tokens ?? u.input_tokens ?? 0;
  const outTok = u.completion_tokens ?? u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreate = u.cache_creation_input_tokens ?? 0;
  let inStr = `IN ${inTok}`;
  if (cacheRead || cacheCreate) {
    const parts = [];
    if (cacheRead) parts.push(`↻${cacheRead}`);
    if (cacheCreate) parts.push(`+${cacheCreate}`);
    inStr += ` (CACHE ${parts.join(" ")})`;
  }
  const ttftStr = latency?.ttft ? ` · TTFT ${latency.ttft}ms` : "";
  return `DONE ${latency?.total ?? 0}ms${ttftStr} · ${inStr} · OUT ${outTok}`;
}

export function saveUsageStats({ provider, model, tokens, connectionId, apiKey, endpoint, serviceTier, label = "USAGE", silent = false }) {
  if (!tokens || typeof tokens !== "object") return;

  const inTokens = tokens.input_tokens ?? tokens.prompt_tokens ?? 0;
  const outTokens = tokens.output_tokens ?? tokens.completion_tokens ?? 0;

  if (inTokens === 0 && outTokens === 0) return;

  if (!silent) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const accountSuffix = connectionId ? ` | account=${connectionId.slice(0, 8)}...` : "";
    console.log(`${COLORS.green}[${time}] 📊 [${label}] ${provider.toUpperCase()} | in=${inTokens} | out=${outTokens}${accountSuffix}${COLORS.reset}`);
  }

  // Canonicalize to one storage convention (prompt_tokens cache-inclusive) so
  // cached/cache-creation tokens survive to cost calc + stats. See canonicalizeUsage.
  const normalized = canonicalizeUsage({
    prompt_tokens: tokens.prompt_tokens ?? tokens.input_tokens ?? 0,
    completion_tokens: tokens.completion_tokens ?? tokens.output_tokens ?? 0,
    ...(tokens.total_tokens !== undefined ? { total_tokens: tokens.total_tokens } : {}),
    ...(tokens.cached_tokens !== undefined ? { cached_tokens: tokens.cached_tokens } : {}),
    ...(tokens.cache_read_input_tokens !== undefined ? { cache_read_input_tokens: tokens.cache_read_input_tokens } : {}),
    ...(tokens.cache_creation_input_tokens !== undefined ? { cache_creation_input_tokens: tokens.cache_creation_input_tokens } : {}),
    ...(tokens.input_tokens_details !== undefined ? { input_tokens_details: tokens.input_tokens_details } : {}),
    ...(tokens.output_tokens_details !== undefined ? { output_tokens_details: tokens.output_tokens_details } : {}),
    ...(tokens.prompt_tokens_details !== undefined ? { prompt_tokens_details: tokens.prompt_tokens_details } : {}),
    ...(tokens.completion_tokens_details !== undefined ? { completion_tokens_details: tokens.completion_tokens_details } : {}),
    ...(tokens.reasoning_tokens !== undefined ? { reasoning_tokens: tokens.reasoning_tokens } : {}),
    ...(tokens.service_tier || serviceTier ? { service_tier: tokens.service_tier || serviceTier } : {}),
    ...(tokens.cost_usd !== undefined ? { cost_usd: tokens.cost_usd } : {}),
    ...(tokens.cost_in_usd !== undefined ? { cost_in_usd: tokens.cost_in_usd } : {}),
    ...(tokens.cost_in_usd_ticks !== undefined ? { cost_in_usd_ticks: tokens.cost_in_usd_ticks } : {})
  }) || {
    prompt_tokens: tokens.prompt_tokens ?? tokens.input_tokens ?? 0,
    completion_tokens: tokens.completion_tokens ?? tokens.output_tokens ?? 0
  };

  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: normalized,
    timestamp: new Date().toISOString(),
    connectionId: connectionId || undefined,
    apiKey: apiKey || undefined,
    endpoint: endpoint || null
  }).catch(() => {});
}

import { describe, expect, it } from "vitest";
import {
  MODEL_PRICING,
  calculateCostBreakdownFromTokens,
  calculateCostFromTokens,
  getPricingForModel,
  resolvePricingForTokens,
} from "../../open-sse/providers/pricing.js";
import {
  canonicalizeUsage,
  extractUsage,
  mergeUsage,
} from "../../open-sse/utils/usageTracking.js";

describe("current model pricing", () => {
  it("contains exact published target model rates", () => {
    expect(MODEL_PRICING["gpt-5.5"]).toMatchObject({
      input: 5, cached: 0.5, cache_creation: 5, output: 30,
    });
    expect(MODEL_PRICING["gpt-5.6-sol"]).toMatchObject({
      input: 5, cached: 0.5, cache_creation: 6.25, output: 30,
    });
    expect(MODEL_PRICING["gpt-5.6-terra"]).toMatchObject({
      input: 2.5, cached: 0.25, cache_creation: 3.125, output: 15,
    });
    expect(MODEL_PRICING["gpt-5.6-luna"]).toMatchObject({
      input: 1, cached: 0.1, cache_creation: 1.25, output: 6,
    });
    expect(MODEL_PRICING["grok-4.5"]).toMatchObject({
      input: 2, cached: 0.5, output: 6, cost_tick_scale: 1e10,
    });
    expect(MODEL_PRICING["claude-fable-5"]).toMatchObject({
      input: 10, cached: 1, cache_creation: 12.5, output: 50,
    });
    expect(MODEL_PRICING["claude-opus-4.8"]).toMatchObject({
      input: 5, cached: 0.5, cache_creation: 6.25, output: 25,
    });
  });

  it("selects exact GPT-5.5 tier and context rates", () => {
    const pricing = getPricingForModel("codex", "gpt-5.5");
    expect(resolvePricingForTokens(pricing, {
      prompt_tokens: 1000,
      service_tier: "default",
    })).toMatchObject({ input: 5, cached: 0.5, cache_creation: 5, output: 30 });
    expect(resolvePricingForTokens(pricing, {
      prompt_tokens: 272001,
      service_tier: "default",
    })).toMatchObject({ input: 10, cached: 1, cache_creation: 10, output: 45 });
    expect(resolvePricingForTokens(pricing, {
      prompt_tokens: 1000,
      service_tier: "flex",
    })).toMatchObject({ input: 2.5, cached: 0.25, cache_creation: 2.5, output: 15 });
    expect(resolvePricingForTokens(pricing, {
      prompt_tokens: 272001,
      service_tier: "fast",
    })).toMatchObject({ input: 12.5, cached: 1.25, cache_creation: 12.5, output: 75 });
  });

  it("selects exact GPT-5.6 tier and context rates", () => {
    const cases = [
      ["gpt-5.6-sol", [5, 0.5, 6.25, 30], [10, 1, 12.5, 45], [2.5, 0.25, 3.125, 15], [5, 0.5, 6.25, 22.5], [10, 1, 12.5, 60]],
      ["gpt-5.6-terra", [2.5, 0.25, 3.125, 15], [5, 0.5, 6.25, 22.5], [1.25, 0.125, 1.5625, 7.5], [2.5, 0.25, 3.125, 11.25], [5, 0.5, 6.25, 30]],
      ["gpt-5.6-luna", [1, 0.1, 1.25, 6], [2, 0.2, 2.5, 9], [0.5, 0.05, 0.625, 3], [1, 0.1, 1.25, 4.5], [2, 0.2, 2.5, 12]],
    ];
    const rates = ([input, cached, cache_creation, output]) => ({ input, cached, cache_creation, output });

    for (const [model, standard, standardLong, discounted, discountedLong, priority] of cases) {
      const pricing = getPricingForModel("codex", model);
      expect(resolvePricingForTokens(pricing, {
        prompt_tokens: 1000,
        service_tier: "default",
      })).toMatchObject(rates(standard));
      expect(resolvePricingForTokens(pricing, {
        prompt_tokens: 272001,
        service_tier: "default",
      })).toMatchObject(rates(standardLong));
      for (const service_tier of ["batch", "flex"]) {
        expect(resolvePricingForTokens(pricing, {
          prompt_tokens: 1000,
          service_tier,
        })).toMatchObject(rates(discounted));
        expect(resolvePricingForTokens(pricing, {
          prompt_tokens: 272001,
          service_tier,
        })).toMatchObject(rates(discountedLong));
      }
      expect(resolvePricingForTokens(pricing, {
        prompt_tokens: 272001,
        service_tier: "fast",
      })).toMatchObject(rates(priority));
    }
  });

  it("charges cache writes once and treats reasoning as included output", () => {
    const pricing = getPricingForModel("codex", "gpt-5.6-sol");
    const tokens = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 },
      output_tokens_details: { reasoning_tokens: 40 },
      service_tier: "default",
    };
    const expected = ((100 * 5) + (800 * 0.5) + (100 * 6.25) + (50 * 30)) / 1_000_000;
    expect(calculateCostFromTokens(tokens, pricing)).toBeCloseTo(expected, 12);
    expect(calculateCostFromTokens({
      input_tokens: 1000,
      output_tokens: 50,
      input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 },
      output_tokens_details: { reasoning_tokens: 40 },
    }, pricing)).toBeCloseTo(expected, 12);

    const breakdown = calculateCostBreakdownFromTokens(tokens, pricing);
    expect(breakdown.uncachedInputCost).toBeCloseTo(100 * 5 / 1_000_000, 12);
    expect(breakdown.cachedInputCost).toBeCloseTo(800 * 0.5 / 1_000_000, 12);
    expect(breakdown.cacheCreationCost).toBeCloseTo(100 * 6.25 / 1_000_000, 12);
    expect(breakdown.outputCost).toBeCloseTo(50 * 30 / 1_000_000, 12);
    expect(breakdown.reasoningCost).toBeCloseTo(40 * 30 / 1_000_000, 12);
    expect(breakdown.visibleOutputCost).toBeCloseTo(10 * 30 / 1_000_000, 12);
    expect(breakdown.totalCost).toBeCloseTo(expected, 12);
  });

  it("uses xAI exact cost ticks and static long-context fallback", () => {
    const pricing = getPricingForModel("xai", "grok-4.5");
    expect(calculateCostFromTokens({
      prompt_tokens: 904,
      completion_tokens: 113,
      cached_tokens: 128,
      cost_in_usd_ticks: 22_940_000,
    }, pricing)).toBeCloseTo(0.002294, 12);
    const exactBreakdown = calculateCostBreakdownFromTokens({
      prompt_tokens: 904,
      completion_tokens: 113,
      cached_tokens: 128,
      cost_in_usd_ticks: 22_940_000,
    }, pricing);
    expect(exactBreakdown.totalCost).toBeCloseTo(0.002294, 12);
    expect(
      exactBreakdown.inputCost +
      exactBreakdown.outputCost +
      exactBreakdown.unallocatedCost
    ).toBeCloseTo(exactBreakdown.totalCost, 12);

    const staticExpected = ((776 * 2) + (128 * 0.5) + (113 * 6)) / 1_000_000;
    expect(calculateCostFromTokens({
      prompt_tokens: 904,
      completion_tokens: 113,
      cached_tokens: 128,
    }, pricing)).toBeCloseTo(staticExpected, 12);
    expect(resolvePricingForTokens(pricing, { prompt_tokens: 200001 })).toMatchObject({
      input: 4, cached: 1, output: 12,
    });
  });

  it("supports Claude Opus 4.8 fast pricing", () => {
    const pricing = getPricingForModel("github", "claude-opus-4.8");
    expect(resolvePricingForTokens(pricing, { service_tier: "fast" })).toMatchObject({
      input: 10, cached: 1, cache_creation: 12.5, output: 50,
    });
  });
});

describe("current usage normalization", () => {
  it("preserves Responses cache writes and effective service tier", () => {
    const usage = extractUsage({
      type: "response.completed",
      response: {
        service_tier: "default",
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 },
          output_tokens: 50,
          output_tokens_details: { reasoning_tokens: 40 },
          total_tokens: 1050,
        },
      },
    });
    const canonical = canonicalizeUsage(usage);
    expect(canonical).toMatchObject({
      prompt_tokens: 1000,
      completion_tokens: 50,
      cached_tokens: 800,
      cache_creation_input_tokens: 100,
      reasoning_tokens: 40,
      service_tier: "default",
    });
  });

  it("merges Claude message_start cache with message_delta output", () => {
    const start = extractUsage({
      type: "message_start",
      message: {
        usage: {
          input_tokens: 100,
          output_tokens: 1,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 30,
        },
      },
    });
    const end = extractUsage({
      type: "message_delta",
      usage: { output_tokens: 50 },
    });
    expect(canonicalizeUsage(mergeUsage(start, end))).toMatchObject({
      prompt_tokens: 330,
      completion_tokens: 50,
      cached_tokens: 200,
      cache_creation_input_tokens: 30,
    });
  });

  it("stores Gemini reasoning inside completion totals", () => {
    expect(extractUsage({
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 40,
        thoughtsTokenCount: 10,
        totalTokenCount: 150,
      },
    })).toMatchObject({
      prompt_tokens: 100,
      completion_tokens: 50,
      reasoning_tokens: 10,
    });
  });
});

import { describe, expect, it } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// Regression: Claude Code sends thinking effort "max" (its top level). When
// 9router routes to an OpenAI-format provider, applyThinking() case "openai"
// must clamp "max"→"xhigh" because OpenAI's reasoning_effort enum has no "max"
// (L.openai caps at "xhigh"). Without the clamp, upstream returns HTTP 400
// "max effort not support". See open-sse/providers/thinkingLevels.js:10.
//
// GPT-5.6 Sol/Terra/Luna are the exception (resolveOpenAiEffort): they expose
// max (and Sol/Terra also ultra) on the wire per their thinkingLevels.js entry.
describe("applyThinking (openai): clamp max effort to xhigh", () => {
  it("client output_config.effort:\"max\" → reasoning_effort:\"xhigh\" (not \"max\")", () => {
    const body = { output_config: { effort: "max" } };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("xhigh");
  });

  it("direct reasoning_effort:\"max\" clamped to \"xhigh\"", () => {
    const body = { reasoning_effort: "max" };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("xhigh");
  });

  it("direct reasoning_effort:\"ultra\" clamped to \"xhigh\"", () => {
    const body = { reasoning_effort: "ultra" };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("xhigh");
  });

  it("\"xhigh\" passes through unchanged (highest valid OpenAI level)", () => {
    const body = { reasoning_effort: "xhigh" };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("xhigh");
  });

  it("\"high\" passes through unchanged", () => {
    const body = { reasoning_effort: "high" };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("high");
  });

  it("max budget (thinking.budget_tokens:128000) → reasoning_effort:\"xhigh\" (budgetToLevel caps at xhigh)", () => {
    const body = { thinking: { type: "enabled", budget_tokens: 128000 } };
    const out = applyThinking(FORMATS.OPENAI, "gpt-5", body, "openai");
    expect(out.reasoning_effort).toBe("xhigh");
  });

  describe("gpt-5.6-sol / gpt-5.6-terra preserve max and ultra (codex)", () => {
    it.each(["gpt-5.6-sol", "gpt-5.6-terra"])("%s: max preserved", (model) => {
      const body = { reasoning_effort: "max" };
      const out = applyThinking(FORMATS.OPENAI, model, body, "codex");
      expect(out.reasoning_effort).toBe("max");
    });

    it.each(["gpt-5.6-sol", "gpt-5.6-terra"])("%s: ultra preserved", (model) => {
      const body = { reasoning_effort: "ultra" };
      const out = applyThinking(FORMATS.OPENAI, model, body, "codex");
      expect(out.reasoning_effort).toBe("ultra");
    });
  });

  describe("gpt-5.6-luna preserves max; ultra falls back to max (codex)", () => {
    it("max preserved", () => {
      const body = { reasoning_effort: "max" };
      const out = applyThinking(FORMATS.OPENAI, "gpt-5.6-luna", body, "codex");
      expect(out.reasoning_effort).toBe("max");
    });

    it("ultra maps to max (nearest supported sibling)", () => {
      const body = { reasoning_effort: "ultra" };
      const out = applyThinking(FORMATS.OPENAI, "gpt-5.6-luna", body, "codex");
      expect(out.reasoning_effort).toBe("max");
    });
  });
});

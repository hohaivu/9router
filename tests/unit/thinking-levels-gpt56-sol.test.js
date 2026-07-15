import { describe, it, expect } from "vitest";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";

describe("getThinkingLevels", () => {
  it.each(["gpt-5.6-sol", "gpt-5.6-terra"])("exposes the full max/ultra matrix for %s", (model) => {
    const levels = getThinkingLevels("codex", model);
    expect(levels).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
  });

  it("exposes max and xhigh but not ultra for gpt-5.6-luna", () => {
    const levels = getThinkingLevels("codex", "gpt-5.6-luna");
    expect(levels).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
    expect(levels).not.toContain("ultra");
  });

  it("preserves the gpt-5.3-codex levels", () => {
    const levels = getThinkingLevels("codex", "gpt-5.3-codex");
    expect(levels).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("preserves the older OpenAI gpt-5 levels without max or ultra", () => {
    const levels = getThinkingLevels("openai", "gpt-5");
    expect(levels).toEqual(["none", "minimal", "low", "medium", "high", "xhigh"]);
    expect(levels).not.toContain("max");
    expect(levels).not.toContain("ultra");
  });

  it("preserves the gpt-5.5 levels without max or ultra", () => {
    const levels = getThinkingLevels("codex", "gpt-5.5");
    expect(levels).toEqual(["none", "minimal", "low", "medium", "high", "xhigh"]);
    expect(levels).not.toContain("max");
    expect(levels).not.toContain("ultra");
  });
});

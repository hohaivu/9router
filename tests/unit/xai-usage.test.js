import { describe, expect, it, vi, beforeEach } from "vitest";

const { allMock } = vi.hoisted(() => ({
  allMock: vi.fn(),
}));

vi.mock("@/lib/db/driver.js", () => ({
  getAdapter: vi.fn(async () => ({ all: allMock })),
}));

const { getXaiUsage } = await import("../../open-sse/services/usage/xai.js");
const { USAGE_APIKEY_PROVIDERS, USAGE_SUPPORTED_PROVIDERS } = await import("../../src/shared/constants/providers.js");

describe("xAI local usage", () => {
  beforeEach(() => {
    allMock.mockReset();
    allMock.mockResolvedValue([
      {
        promptTokens: 0,
        completionTokens: 0,
        cost: 0.01,
        tokens: JSON.stringify({
          prompt_tokens: 100,
          completion_tokens: 30,
          total_tokens: 130,
          reasoning_tokens: 10,
          cached_tokens: 80,
        }),
      },
    ]);
  });

  it("returns quota rows from local usageHistory", async () => {
    const usage = await getXaiUsage("xai-conn-1");

    expect(allMock).toHaveBeenCalledTimes(3);
    for (const call of allMock.mock.calls) {
      expect(call[1][0]).toBe("xai-conn-1");
    }
    expect(usage.plan).toBe("Local usage");
    expect(usage.quotas["Today tokens"].used).toBe(130);
    expect(usage.quotas["7d tokens"].used).toBe(130);
    expect(usage.quotas["30d tokens"].used).toBe(130);
    expect(usage.quotas["Today requests"].used).toBe(1);
    expect(usage.usage.today.reasoningTokens).toBe(10);
    expect(usage.usage.today.cachedTokens).toBe(80);
  });

  it("returns an empty quota object without a connection id", async () => {
    await expect(getXaiUsage()).resolves.toEqual({ quotas: {} });
    expect(allMock).not.toHaveBeenCalled();
  });

  it("makes xAI eligible for the quota tracker", () => {
    expect(USAGE_SUPPORTED_PROVIDERS).toContain("xai");
    expect(USAGE_APIKEY_PROVIDERS).toContain("xai");
  });
});

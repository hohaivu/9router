import { describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(async () => new Response("", { status: 200, headers: { "Content-Type": "text/event-stream" } })),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

const CREDENTIALS = { accessToken: "token", connectionId: "conn_1" };

async function sendAndCapture(model, extra) {
  proxyAwareFetch.mockClear();
  const executor = new CodexExecutor();
  await executor.execute({
    model,
    body: { model, input: "hi", ...extra },
    stream: true,
    credentials: CREDENTIALS,
  });
  const [, init] = proxyAwareFetch.mock.calls[0];
  return JSON.parse(init.body);
}

// End-to-end guard (complements the transformRequest-level matrix in
// codex-fast-capacity.test.js): confirms the actual outbound POST body sent
// to Codex carries the resolved wire effort, not just the return value of
// transformRequest in isolation.
describe("Codex outbound wire effort", () => {
  it.each([
    ["gpt-5.6-sol", "max", "max"],
    ["gpt-5.6-sol", "ultra", "max"],
    ["gpt-5.6-terra", "ultra", "max"],
    ["gpt-5.5", "ultra", "xhigh"],
  ])("%s reasoning_effort=%s → wire reasoning.effort=%s", async (model, requested, expected) => {
    const body = await sendAndCapture(model, { reasoning_effort: requested });
    expect(body.reasoning.effort).toBe(expected);
  });

  // Case-sensitive alias lookup: uppercase "ULTRA"/"Ultra" don't match the
  // lowercase-only reasoningEffortAliases map, so they pass through untouched.
  it("does not promote uppercase ULTRA/Ultra (case-sensitive alias lookup)", async () => {
    const upper = await sendAndCapture("gpt-5.5", { reasoning_effort: "ULTRA" });
    expect(upper.reasoning.effort).toBe("ULTRA");

    const mixed = await sendAndCapture("gpt-5.5", { reasoning_effort: "Ultra" });
    expect(mixed.reasoning.effort).toBe("Ultra");
  });
});

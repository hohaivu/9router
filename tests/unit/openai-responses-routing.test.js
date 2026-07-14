/**
 * Regression test: reasoning-capable OpenAI models (e.g. gpt-5.x) reject
 * function tools + reasoning_effort on /chat/completions with a 400 pointing
 * at /v1/responses. OpenAIExecutor must auto-escalate transparently,
 * mirroring the GitHub Copilot #1062 pattern.
 */

import { describe, it, expect, vi } from "vitest";
import { OpenAIExecutor } from "../../open-sse/executors/openai.js";
import { BaseExecutor } from "../../open-sse/executors/base.js";

const RESPONSES_REQUIRED_ERROR = JSON.stringify({
  error: {
    message: "Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions. Please use /v1/responses instead.",
    type: "invalid_request_error",
    param: "reasoning_effort",
    code: null,
  },
});

describe("OpenAIExecutor.execute escalation", () => {
  it("escalates to /responses on the reasoning_effort 400 and caches the model", async () => {
    const exec = new OpenAIExecutor();
    const respSpy = vi
      .spyOn(exec, "executeWithResponsesEndpoint")
      .mockResolvedValue({ via: "responses" });
    const baseSpy = vi
      .spyOn(BaseExecutor.prototype, "execute")
      .mockResolvedValue({
        response: { status: 400, clone: () => ({ text: async () => RESPONSES_REQUIRED_ERROR }) },
      });

    const result = await exec.execute({ model: "gpt-5.6-sol", body: { messages: [] }, log: null });

    expect(baseSpy).toHaveBeenCalled();
    expect(respSpy).toHaveBeenCalled();
    expect(result.via).toBe("responses");
    expect(exec.knownResponsesModels.has("gpt-5.6-sol")).toBe(true);

    baseSpy.mockRestore();
  });

  it("does NOT escalate on an unrelated 400", async () => {
    const exec = new OpenAIExecutor();
    const respSpy = vi
      .spyOn(exec, "executeWithResponsesEndpoint")
      .mockResolvedValue({ via: "responses" });
    const baseSpy = vi
      .spyOn(BaseExecutor.prototype, "execute")
      .mockResolvedValue({
        response: { status: 400, clone: () => ({ text: async () => '{"error":{"message":"invalid api key"}}' }) },
        via: "chat",
      });

    const result = await exec.execute({ model: "gpt-5.6-sol", body: { messages: [] }, log: null });

    expect(respSpy).not.toHaveBeenCalled();
    expect(result.via).toBe("chat");
    expect(exec.knownResponsesModels.has("gpt-5.6-sol")).toBe(false);

    baseSpy.mockRestore();
  });

  it("uses the cached /responses route on subsequent calls, skipping /chat/completions", async () => {
    const exec = new OpenAIExecutor();
    exec.knownResponsesModels.add("gpt-5.6-sol");

    const respSpy = vi
      .spyOn(exec, "executeWithResponsesEndpoint")
      .mockResolvedValue({ via: "responses" });
    const baseSpy = vi.spyOn(BaseExecutor.prototype, "execute");

    const result = await exec.execute({ model: "gpt-5.6-sol", body: { messages: [] }, log: null });

    expect(baseSpy).not.toHaveBeenCalled();
    expect(respSpy).toHaveBeenCalled();
    expect(result.via).toBe("responses");

    baseSpy.mockRestore();
  });
});

describe("OpenAIExecutor.finalizeResponsesBody", () => {
  it("renames max_tokens to max_output_tokens for the public /v1/responses API", () => {
    const exec = new OpenAIExecutor();
    const body = { model: "gpt-5.6-sol", max_tokens: 4096 };

    exec.finalizeResponsesBody(body);

    expect(body.max_tokens).toBeUndefined();
    expect(body.max_output_tokens).toBe(4096);
  });

  it("leaves a body without max_tokens untouched", () => {
    const exec = new OpenAIExecutor();
    const body = { model: "gpt-5.6-sol" };

    exec.finalizeResponsesBody(body);

    expect(body.max_output_tokens).toBeUndefined();
  });
});

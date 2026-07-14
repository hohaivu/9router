/**
 * Regression test: newer Responses-native clients resend a `reasoning` (or
 * other non-message) input item carrying a stray `content` field. Codex's
 * gpt-5.x backend strictly rejects it with a 400
 * "Unknown parameter: 'input[0].content'". transformRequest must strip
 * `content` from any non-message input item while preserving the reasoning
 * item's continuity fields (summary, encrypted_content).
 */

import { describe, expect, it } from "vitest";

import { CodexExecutor } from "../../open-sse/executors/codex.js";

function transform(input) {
  const executor = new CodexExecutor();
  const body = { model: "gpt-5.6-sol", input, stream: true };

  executor.transformRequest("gpt-5.6-sol", body, true, {
    connectionId: "test-codex-input-content",
    providerSpecificData: {},
  });

  return body.input;
}

describe("CodexExecutor input content stripping", () => {
  it("strips content from a reasoning item while preserving summary and encrypted_content", () => {
    const input = transform([
      {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "thinking..." }],
        encrypted_content: "opaque-blob",
        content: [{ type: "reasoning_text", text: "leaked content" }],
      },
      { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    ]);

    const reasoningItem = input.find((i) => i.type === "reasoning");
    expect(reasoningItem.content).toBeUndefined();
    expect(reasoningItem.summary).toEqual([{ type: "summary_text", text: "thinking..." }]);
    expect(reasoningItem.encrypted_content).toBe("opaque-blob");
  });

  it("leaves a message item's content untouched", () => {
    const input = transform([
      { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    ]);

    expect(input[0].content).toEqual([{ type: "input_text", text: "hi" }]);
  });

  it("strips a stray content field from a function_call item", () => {
    const input = transform([
      { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}", content: "stray" },
      { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    ]);

    const fnCall = input.find((i) => i.type === "function_call");
    expect(fnCall.content).toBeUndefined();
    expect(fnCall.name).toBe("read_file");
  });
});

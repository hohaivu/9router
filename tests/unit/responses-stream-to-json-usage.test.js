import { describe, expect, it } from "vitest";
import { convertResponsesStreamToJson } from "../../open-sse/transformer/streamToJsonConverter.js";

function sseStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const [event, data] of events) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
}

describe("Responses stream to JSON usage", () => {
  it("preserves model, effective service tier, and usage details", async () => {
    const response = await convertResponsesStreamToJson(sseStream([
      ["response.created", {
        type: "response.created",
        response: { id: "resp_test", created_at: 123 },
      }],
      ["response.completed", {
        type: "response.completed",
        response: {
          id: "resp_test",
          model: "gpt-5.6-sol",
          service_tier: "default",
          usage: {
            input_tokens: 1000,
            input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 },
            output_tokens: 50,
            output_tokens_details: { reasoning_tokens: 40 },
            total_tokens: 1050,
          },
        },
      }],
    ]));

    expect(response).toMatchObject({
      id: "resp_test",
      model: "gpt-5.6-sol",
      service_tier: "default",
      usage: {
        input_tokens: 1000,
        input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 },
        output_tokens: 50,
        output_tokens_details: { reasoning_tokens: 40 },
        total_tokens: 1050,
      },
    });
  });
});

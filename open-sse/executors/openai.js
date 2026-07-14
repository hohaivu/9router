import { DefaultExecutor } from "./default.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";

// Reasoning-capable OpenAI models (e.g. gpt-5.x) reject function tools +
// reasoning_effort on /chat/completions with a 400 pointing at /v1/responses.
// Escalate transparently, mirroring the GitHub Copilot #1062 pattern.
export class OpenAIExecutor extends DefaultExecutor {
  constructor() {
    super("openai");
    this.knownResponsesModels = new Set();
  }

  // Public /v1/responses uses max_output_tokens, not max_tokens.
  finalizeResponsesBody(body) {
    if (body.max_tokens !== undefined) {
      body.max_output_tokens = body.max_tokens;
      delete body.max_tokens;
    }
  }

  async execute(options) {
    const { model, log } = options;

    if (this.knownResponsesModels.has(model)) {
      log?.debug("OPENAI", `Using cached /responses route for ${model}`);
      return this.executeWithResponsesEndpoint(options);
    }

    const result = await super.execute(options);

    if (result.response.status === HTTP_STATUS.BAD_REQUEST) {
      const errorBody = await result.response.clone().text();
      if (errorBody.includes("/v1/responses") && (errorBody.includes("reasoning_effort") || errorBody.includes("not supported"))) {
        log?.warn("OPENAI", `Model ${model} requires /responses. Switching...`);
        this.knownResponsesModels.add(model);
        return this.executeWithResponsesEndpoint(options);
      }
    }

    return result;
  }
}

export default OpenAIExecutor;

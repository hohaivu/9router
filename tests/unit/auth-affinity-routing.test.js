import { beforeEach, describe, expect, it, vi } from "vitest";

let connections = [];
let settings = {};

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => connections),
  validateApiKey: vi.fn(),
  updateProviderConnection: vi.fn(async (id, patch) => {
    const conn = connections.find((item) => item.id === id);
    if (conn) Object.assign(conn, patch);
  }),
  getSettings: vi.fn(async () => settings),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({
    connectionProxyEnabled: false,
    connectionProxyUrl: null,
    connectionNoProxy: null,
    proxyPoolId: null,
  })),
}));

vi.mock("open-sse/services/accountFallback.js", () => ({
  formatRetryAfter: vi.fn(() => "later"),
  checkFallbackError: vi.fn(() => ({ shouldFallback: true, cooldownMs: 1000, newBackoffLevel: 1 })),
  isModelLockActive: vi.fn(() => false),
  buildModelLockUpdate: vi.fn(() => ({})),
  getEarliestModelLockUntil: vi.fn(() => null),
}));

vi.mock("@/shared/constants/providers.js", () => ({
  resolveProviderId: vi.fn((provider) => provider),
}));

async function loadAuth() {
  vi.resetModules();
  return import("../../src/sse/services/auth.js");
}

function makeConn(id, lastUsedAt = null, consecutiveUseCount = 0, priority = 999) {
  return {
    id,
    apiKey: `${id}-key`,
    accessToken: `${id}-token`,
    refreshToken: `${id}-refresh`,
    displayName: id,
    lastUsedAt,
    consecutiveUseCount,
    priority,
    testStatus: "active",
    providerSpecificData: {},
  };
}

describe("auth affinity routing", () => {
  beforeEach(() => {
    connections = [];
    settings = {};
    vi.clearAllMocks();
  });

  it("reuses same eligible account for same affinity key", async () => {
    connections = [makeConn("acct-a"), makeConn("acct-b")];
    settings = { fallbackStrategy: "fill-first" };

    const { getProviderCredentials } = await loadAuth();
    const affinityContext = {
      apiKeyFingerprint: "api-fp",
      routedModel: "openai/gpt-4.1",
      firstActiveMessageHash: "msg-hash",
      toolCount: 2,
    };

    const first = await getProviderCredentials("openai", new Set(), "gpt-4.1", affinityContext);
    const second = await getProviderCredentials("openai", new Set(), "gpt-4.1", affinityContext);

    expect(first.connectionId).toBe(second.connectionId);
    expect(second.routingOutcome).toBe("affinity-hit");
  });

  it("falls back to sticky round-robin when affinity missing", async () => {
    connections = [
      makeConn("acct-a", "2025-01-01T10:00:00.000Z", 1),
      makeConn("acct-b", "2025-01-01T09:00:00.000Z", 1),
    ];
    settings = { fallbackStrategy: "round-robin", stickyRoundRobinLimit: 3 };

    const { getProviderCredentials } = await loadAuth();
    const creds = await getProviderCredentials("openai", new Set(), "gpt-4.1", null);

    expect(creds.connectionId).toBe("acct-a");
    expect(creds.routingOutcome).toBe("fallback");
  });

  it("remaps affinity when prior account excluded", async () => {
    connections = [makeConn("acct-a"), makeConn("acct-b")];
    settings = { fallbackStrategy: "fill-first" };

    const { getProviderCredentials } = await loadAuth();
    const affinityContext = {
      apiKeyFingerprint: "api-fp-2",
      routedModel: "openai/gpt-4.1",
      firstActiveMessageHash: "msg-hash-2",
      toolCount: 0,
    };

    const first = await getProviderCredentials("openai", new Set(), "gpt-4.1", affinityContext);
    const remapped = await getProviderCredentials("openai", new Set([first.connectionId]), "gpt-4.1", affinityContext);

    expect(remapped.connectionId).not.toBe(first.connectionId);
    expect(remapped.routingOutcome).toBe("affinity-miss");
  });

  it("allows distinct affinity keys to land on different accounts", async () => {
    connections = [makeConn("acct-a"), makeConn("acct-b"), makeConn("acct-c")];
    settings = { fallbackStrategy: "fill-first" };

    const { getProviderCredentials } = await loadAuth();

    const base = {
      apiKeyFingerprint: "api-fp-shared",
      routedModel: "openai/gpt-4.1",
      toolCount: 1,
    };

    const seen = new Map();
    for (let i = 0; i < 20; i += 1) {
      const ctx = { ...base, firstActiveMessageHash: `msg-${i}` };
      const creds = await getProviderCredentials("openai", new Set(), "gpt-4.1", ctx);
      seen.set(ctx.firstActiveMessageHash, creds.connectionId);
    }

    const uniqueAccounts = new Set(seen.values());
    expect(uniqueAccounts.size).toBeGreaterThan(1);
  });

  it("preserves fairness by picking different eligible accounts for distinct affinities", async () => {
    connections = [makeConn("acct-a"), makeConn("acct-b"), makeConn("acct-c")];
    settings = { fallbackStrategy: "fill-first" };

    const { getProviderCredentials } = await loadAuth();

    const affinityA = {
      apiKeyFingerprint: "api-fp-3",
      routedModel: "openai/gpt-4.1",
      firstActiveMessageHash: "msg-x",
      toolCount: 0,
    };
    const affinityB = {
      apiKeyFingerprint: "api-fp-3",
      routedModel: "openai/gpt-4.1",
      firstActiveMessageHash: "msg-y",
      toolCount: 0,
    };

    const first = await getProviderCredentials("openai", new Set(), "gpt-4.1", affinityA);
    const second = await getProviderCredentials("openai", new Set(), "gpt-4.1", affinityB);

    expect(new Set([first.connectionId, second.connectionId]).size).toBeGreaterThan(1);
  });
});

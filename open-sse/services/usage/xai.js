import { getAdapter } from "@/lib/db/driver.js";

function parseTokens(value) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date = new Date()) {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function summarize(rows) {
  return rows.reduce((acc, row) => {
    const tokens = parseTokens(row.tokens);
    const prompt = tokens.prompt_tokens || tokens.input_tokens || row.promptTokens || 0;
    const completion = tokens.completion_tokens || tokens.output_tokens || row.completionTokens || 0;
    acc.requests += 1;
    acc.promptTokens += prompt;
    acc.completionTokens += completion;
    acc.totalTokens += tokens.total_tokens || prompt + completion;
    acc.reasoningTokens += tokens.reasoning_tokens || tokens.output_tokens_details?.reasoning_tokens || 0;
    acc.cachedTokens += tokens.cached_tokens || tokens.input_tokens_details?.cached_tokens || 0;
    acc.cost += Number(row.cost) || 0;
    return acc;
  }, {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    cost: 0,
  });
}

function unlimitedRow(used, resetAt = null) {
  return {
    used,
    total: 0,
    remainingPercentage: 100,
    resetAt,
  };
}

async function getRows(connectionId, sinceIso) {
  const db = await getAdapter();
  return db.all(
    `SELECT timestamp, promptTokens, completionTokens, cost, tokens
     FROM usageHistory
     WHERE provider = 'xai'
       AND connectionId = ?
       AND timestamp >= ?
     ORDER BY timestamp ASC`,
    [connectionId, sinceIso]
  );
}

export async function getXaiUsage(connectionId) {
  if (!connectionId) return { quotas: {} };

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const tomorrow = endOfLocalDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [today, week, month] = await Promise.all([
    getRows(connectionId, todayStart.toISOString()).then(summarize),
    getRows(connectionId, sevenDaysAgo.toISOString()).then(summarize),
    getRows(connectionId, thirtyDaysAgo.toISOString()).then(summarize),
  ]);

  return {
    plan: "Local usage",
    quotas: {
      "Today tokens": unlimitedRow(today.totalTokens, tomorrow.toISOString()),
      "7d tokens": unlimitedRow(week.totalTokens),
      "30d tokens": unlimitedRow(month.totalTokens),
      "Today requests": unlimitedRow(today.requests, tomorrow.toISOString()),
    },
    usage: { today, week, month },
  };
}

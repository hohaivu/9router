# Design: Codex task/account affinity routing

## Overview
Add heuristic routing that treats a multi-turn Codex interaction as a task, not only as isolated requests. Router should keep task continuity when confidence is high, but still allow concurrent tasks to spread across accounts.

## Design principles
- Prefer stable task identity over volatile message shape.
- Never require explicit client-provided continuity fields.
- Preserve current behavior when heuristic confidence is low.
- Keep account selection fair across active tasks.

## Heuristic identity
Primary task key candidate:
- API key fingerprint
- routed model
- first active message hash

Weak tie-breaker:
- tool count

Rejected as primary identity signals:
- message_count
- role_shape_fingerprint
- last_active_message_hash

Rationale:
- `first_active_message_hash` stays stable within observed task families and differs across tasks.
- `message_count`, `role_shape_fingerprint`, and `last_active_message_hash` vary too much across turns.

## Routing behavior
1. Build task affinity key from primary heuristic signals.
2. Look up existing account assignment for that key.
3. If assignment exists and account is eligible, keep same account.
4. If no assignment exists, choose eligible account using current load/fairness policy.
5. If heuristic signals conflict or are absent, fall back to request-level sticky/LRU behavior.

## Eligibility and balance
- Affinity should not override health, capacity, or policy exclusions.
- If selected account becomes unavailable, router may remap task to another eligible account.
- Concurrent tasks with distinct keys should be able to land on different accounts.

## Observability requirements
- Routing decisions should distinguish affinity hit, affinity miss, and fallback.
- Logs/metrics should make task-key source and tie-break reason visible enough for debugging.

## Failure modes
- Weak task signal: use fallback routing.
- Account exhaustion: preserve task affinity if possible, otherwise fail over to next eligible account.
- Key collision: weak signals must not force incorrect hard binding.

## Open questions
- Exact TTL for affinity mapping.
- Whether affinity mapping survives process restart.
- Whether tie-breaker uses tool count only in scoring or also in key construction.

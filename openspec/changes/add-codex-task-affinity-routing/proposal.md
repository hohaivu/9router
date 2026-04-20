# Proposal: Codex task/account affinity routing

## Problem
Current OpenCode/OpenAI-compatible chat-completions routing is sticky at request level and relies on LRU-style account selection. That keeps single requests local, but it does not preserve account continuity for a multi-turn task. Concurrent tasks can also collide on same account selection when no task identity exists.

Observed traffic has no built-in continuity keys (`previous_response_id`, `conversation_id`, `thread_id` all null). That leaves routing without an explicit task anchor.

## Goal
Add heuristic task/account affinity routing so one task tends to stay on one Codex account across turns, while concurrent tasks can still spread across accounts.

## Proposed behavior
- Derive task affinity from stable request signals instead of request order alone.
- Prefer a task key built from API key fingerprint + routed model + first active message hash.
- Use tool count only as weak tie-breaker, not primary identity.
- Keep routing compatible with existing chat-completions traffic and do not require new client fields.

## Non-goals
- No change to chat-completions API contract.
- No hard session binding when task signals are ambiguous or absent.
- No implementation detail in this change record.

## Success criteria
- Same task across turns usually routes to same Codex account.
- Different concurrent tasks with same API key can distribute across accounts.
- Routing remains best-effort when heuristic signals are weak or conflicting.

# Capability: task-affinity-routing

## Intent
Route OpenAI-compatible chat-completions traffic with heuristic Codex task/account affinity so a multi-turn task tends to remain on same Codex account across turns.

## New requirements

### Requirement: infer task affinity from stable request signals
System SHALL infer task identity from request signals that are stable across turns, with API key fingerprint, routed model, and first active message hash as primary inputs.

### Requirement: avoid volatile fields as primary identity
System SHALL NOT use message_count, role_shape_fingerprint, or last_active_message_hash as primary task identity signals.

### Requirement: allow weak tie-breaking
System MAY use tool count as a weak tie-breaker when task identity is otherwise ambiguous.

### Requirement: preserve account continuity for known tasks
When a request matches existing task affinity and account remains eligible, system SHALL route subsequent turns of that task to same Codex account.

### Requirement: spread concurrent tasks
When multiple concurrent tasks have distinct affinity keys, system SHALL allow them to map to different Codex accounts.

### Requirement: fall back on low confidence
When task affinity cannot be derived with sufficient confidence, system SHALL fall back to existing sticky/LRU request routing behavior.

### Requirement: honor account eligibility
Task affinity SHALL NOT override account health, capacity, or exclusion rules.

### Requirement: recover from account loss
If task-affined account becomes unavailable, system SHALL remap task to another eligible account and continue routing best-effort.

### Requirement: expose routing outcome type
System SHALL make routing outcome distinguishable as affinity hit, affinity miss, or fallback for observability purposes.

## Notes
- No client-visible continuity field is required.
- No chat-completions request/response shape change is required.

# Tasks: Codex task/account affinity routing

## 1. Specify heuristic task identity
- [x] Define affinity key inputs from API key fingerprint, routed model, and first active message hash.
- [x] Document tool count as weak tie-breaker only.

## 2. Route with task affinity
- [x] Add behavior to reuse prior account for known affinity keys when account stays eligible.
- [x] Keep current sticky/LRU fallback when affinity confidence is low or key is missing.

## 3. Balance concurrent tasks
- [x] Allow distinct affinity keys to map onto different eligible accounts.
- [x] Preserve fairness and capacity checks during selection.

## 4. Handle recovery and observability
- [x] Remap task when affined account becomes unavailable.
- [x] Distinguish affinity hit, affinity miss, and fallback in routing observability.

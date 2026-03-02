# Design: Fix Cross-Model Conversation Auto-Title Generation

## Context
Current auto-title behavior depends on:
1. Renderer first-turn trigger correctness.
2. Remote provider response shape compatibility.

Failures in either stage leave title as default placeholder (`新对话`).

## Root Causes
1. **Trigger race in renderer**
   - First-turn detection currently relies on in-memory message list that may be stale during fast conversation switching.
2. **Strict provider parsing**
   - Adapter parsing expects narrow JSON shapes; compatible gateways may respond with slightly different structures.
3. **No final guarantee**
   - If remote generation fails/returns empty, no guaranteed fallback title is applied.

## Goals
- Guarantee non-default title after first successful response, regardless of model/provider.
- Keep provider-specific adapters, but make extraction tolerant.
- Maintain existing user-facing behavior (manual rename, chat streaming).

## Proposed Architecture

### A. Reliable First-Turn Trigger
In renderer (`ChatView`):
- Compute first-turn eligibility from conversation-scoped source that cannot be contaminated by prior conversation state.
- Keep resend/edit/truncate flows explicitly excluded.
- Store one-shot marker per conversation to prevent duplicate trigger.

### B. Two-Layer Title Extraction
In main/core:
1. Adapter-specific extraction remains primary.
2. Generic fallback extraction scans common text-bearing paths in provider responses.

Extraction output pipeline:
- raw text -> trim -> strip quotes/brackets -> collapse whitespace -> truncate (`MAX_TITLE_LENGTH`) -> nullable result.

### C. Deterministic Fallback Title
If remote extraction yields empty:
- Derive title from first user message deterministically.
- Reuse existing short-message safety behavior.
- Apply only when current title is default placeholder.

### D. Observability
Emit reason-coded logs for each title attempt and result:
- `title_generated_remote`
- `title_generated_fallback`
- `title_failed_parse`
- `title_failed_request`
- `title_not_triggered`

## Data/State Impact
- No schema migration required.
- Existing conversation metadata structure remains unchanged.

## Risk Analysis
1. **Over-capture noisy text** in generic fallback.
   - Mitigation: conservative extraction order + sanitizer + max length.
2. **Duplicate title updates** due to repeated stream events.
   - Mitigation: one-shot conversation marker and idempotent update guard.
3. **Unexpected overwrite of user-edited titles**.
   - Mitigation: update only if current title is default placeholder.

## Validation Strategy
- Unit tests for parsing and fallback sanitizer.
- Manual provider matrix verification.
- Reproduction test for fast conversation switch race.

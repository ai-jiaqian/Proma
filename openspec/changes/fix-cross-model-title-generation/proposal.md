# Change Proposal: Fix Cross-Model Conversation Auto-Title Generation

## Status
Proposed

## Problem
Conversation auto-title generation is inconsistent across models/providers.

Observed behavior:
- Claude models usually auto-generate a title.
- Some non-Claude models (for example GLM via compatible gateways) keep the default title (`New Conversation` / `新对话`) even when chat replies are successful.

This creates a provider-dependent user experience and makes conversation history harder to navigate.

## Goals
1. Make auto-title generation provider-agnostic and reliable.
2. Ensure every conversation gets a non-default title after the first completed assistant reply.
3. Preserve existing behavior for manual title edit and normal chat generation.

## Non-Goals
- Rewriting the chat pipeline.
- Building a sophisticated title-quality ranking system.
- Provider-specific UI customizations.

## Proposed Changes

### 1) Trigger Reliability (Renderer)
Harden first-turn detection in chat view so title generation always triggers for the real first completed exchange of a conversation, even under async view-switch timing.

Potential implementation direction:
- Avoid relying only on in-memory message array length during fast conversation switches.
- Use conversation-scoped message state or a persisted message count source for first-turn detection.

### 2) Provider-Agnostic Title Extraction (Core)
Make title response parsing tolerant across provider-compatible response shapes.

Potential implementation direction:
- Keep provider adapters, but add robust extraction fallback when adapter-specific parsing returns empty.
- Support common text locations used by OpenAI-compatible, Anthropic-compatible, and Google-style responses.

### 3) Deterministic Fallback Title (Main)
If online title generation fails or returns empty:
- Derive title from first user message using local deterministic rules (trim, sanitize, truncate).
- Always avoid leaving the default placeholder title after first successful round.

### 4) Observability
Add explicit reason codes in logs for title outcomes:
- `title_generated_remote`
- `title_generated_fallback`
- `title_failed_parse`
- `title_failed_request`
- `title_not_triggered`

This supports quick diagnosis for future provider integrations.

## Acceptance Criteria
1. For every supported provider type, if first-round chat reply succeeds, conversation title becomes non-default.
2. If remote title API fails, fallback title is applied automatically.
3. Manual title editing remains unchanged.
4. No regression in message send/stream behavior.

## Affected Areas
- `apps/electron/src/renderer/components/chat/ChatView.tsx`
- `apps/electron/src/main/lib/chat-service.ts`
- `packages/core/src/providers/sse-reader.ts`
- `packages/core/src/providers/anthropic-adapter.ts`
- `packages/core/src/providers/openai-adapter.ts`
- `packages/core/src/providers/google-adapter.ts`

## Risks
- Overly broad response parsing may capture noisy text.
- Fallback may reduce title quality in edge cases.

## Mitigation
- Keep remote title result as first priority.
- Apply conservative sanitization/truncation rules for fallback.
- Add focused tests for parse and fallback paths.

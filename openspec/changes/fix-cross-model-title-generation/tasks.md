# Tasks: Fix Cross-Model Conversation Auto-Title Generation

## 1. Trigger Reliability (Renderer)
- [ ] 1.1 In `/apps/electron/src/renderer/components/chat/ChatView.tsx`, replace first-turn detection that depends on potentially stale in-memory `currentMessages.length` with conversation-scoped reliable detection.
- [ ] 1.2 Ensure title generation trigger remains correct for resend/edit/truncate flows (must not treat those flows as fresh-conversation first turn).
- [ ] 1.3 Add guard to avoid duplicate trigger for the same conversation first turn.

## 2. Title Generation Robustness (Main)
- [ ] 2.1 In `/apps/electron/src/main/lib/chat-service.ts`, add deterministic local fallback title derivation when remote title generation fails or returns empty.
- [ ] 2.2 Ensure fallback is only applied when current title is still default placeholder.
- [ ] 2.3 Keep short-message direct-title behavior and unify sanitization/truncation rules.

## 3. Provider-Agnostic Parsing (Core)
- [ ] 3.1 In `/packages/core/src/providers/sse-reader.ts`, preserve adapter-first parsing, then add generic fallback extraction from common response shapes.
- [ ] 3.2 In `/packages/core/src/providers/openai-adapter.ts`, broaden `parseTitleResponse` support for common OpenAI-compatible variants.
- [ ] 3.3 In `/packages/core/src/providers/anthropic-adapter.ts`, broaden `parseTitleResponse` support for Anthropic-compatible variants beyond strict `content[].text` only.
- [ ] 3.4 In `/packages/core/src/providers/google-adapter.ts`, broaden `parseTitleResponse` support for alternate candidate/parts layouts.

## 4. Observability
- [ ] 4.1 Add structured logs for title lifecycle outcomes: `title_generated_remote`, `title_generated_fallback`, `title_failed_parse`, `title_failed_request`, `title_not_triggered`.
- [ ] 4.2 Include provider, modelId, conversationId in logs without exposing secrets.

## 5. Tests
- [ ] 5.1 Add unit tests for title extraction fallback logic covering OpenAI-compatible, Anthropic-compatible, Google-style and malformed payloads.
- [ ] 5.2 Add tests for deterministic local fallback title sanitizer/truncator.
- [ ] 5.3 Add renderer-level behavioral test (or integration harness assertion) for fast conversation switch + first message scenario.

## 6. Validation
- [ ] 6.1 Manual matrix test across providers configured in app (at minimum: Anthropic, OpenAI-compatible, Google-compatible).
- [ ] 6.2 Verify that first successful assistant response yields non-default title.
- [ ] 6.3 Verify manual rename remains unchanged and is not overwritten by auto-title.

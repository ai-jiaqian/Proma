# Spec Delta: chat-title-generation

## ADDED Requirements

### Requirement: Auto-title must be provider-agnostic and guaranteed
The system SHALL assign a non-default conversation title after the first successful assistant response, regardless of provider/model, as long as chat response itself succeeded.

#### Scenario: Remote title generation succeeds
- **Given** a new conversation with default title
- **And** first user message is sent and first assistant response completes successfully
- **When** provider title API returns a non-empty title
- **Then** the conversation title is updated to that returned title (after normalization)

#### Scenario: Remote title generation fails
- **Given** a new conversation with default title
- **And** first assistant response completes successfully
- **When** provider title API fails, times out, or returns empty/unparseable payload
- **Then** the system derives a local fallback title from first user message
- **And** updates conversation title to that fallback

### Requirement: First-turn trigger must be reliable under async view switching
The system SHALL reliably detect first-turn title trigger without depending on stale message state from another conversation.

#### Scenario: Fast switch + immediate send
- **Given** user switches to a newly created conversation
- **And** quickly sends first message before asynchronous message-load settles
- **When** first assistant response completes
- **Then** title generation flow is still triggered for that conversation

### Requirement: Auto-title must not overwrite user-customized title
The system SHALL only auto-update title when current title is still default placeholder.

#### Scenario: User manually renamed conversation
- **Given** a conversation with a user-customized title
- **When** subsequent auto-title flow runs
- **Then** the customized title remains unchanged

### Requirement: Parsing must tolerate common provider response variants
The system SHALL support extraction from common OpenAI-compatible, Anthropic-compatible, and Google-style text-bearing response structures.

#### Scenario: OpenAI-compatible variant
- **Given** a provider returns title text in a non-primary but common OpenAI-compatible path
- **When** primary adapter parse path returns empty
- **Then** fallback extraction retrieves title text if present

#### Scenario: Anthropic-compatible variant
- **Given** a provider returns title text in an alternate Anthropic-compatible content block structure
- **When** strict parse path returns empty
- **Then** fallback extraction retrieves title text if present

#### Scenario: Google-style variant
- **Given** a provider returns text in alternate candidate/parts structure
- **When** strict parse path returns empty
- **Then** fallback extraction retrieves title text if present

### Requirement: Title lifecycle outcomes must be observable
The system SHALL log reason-coded title outcomes for diagnosis.

#### Scenario: Title generated remotely
- **Given** remote parsing succeeds
- **Then** log includes `title_generated_remote`

#### Scenario: Title generated via fallback
- **Given** remote title generation fails or parsing is empty
- **Then** log includes `title_generated_fallback`

#### Scenario: Title not triggered
- **Given** first-turn trigger path is skipped
- **Then** log includes `title_not_triggered`

# AI Conversation Analysis Prompts - Version 1

This directory contains prompt templates and examples for AI-powered conversation analysis.

## Files

### system-prompt.md

The main prompt template that instructs the AI model on how to analyze conversations. Contains placeholders for dynamic content that are filled at runtime.

### examples.json

Few-shot training examples showing the AI model what kind of analysis output is expected. Each example contains:

- `transcript`: An array of conversation messages between user and model
- `expectedOutput`: The desired analysis structure matching the `ConversationAnalysis` TypeScript type

## Schema Overview

The `expectedOutput` structure includes:

- **summary**: Concise overview of the conversation
- **keyTopics**: Main subjects discussed
- **sentiment**: Overall user sentiment (positive/neutral/negative/mixed)
- **userIntent**: Primary goal the user was trying to achieve
- **outcomes**: Key resolutions or conclusions
- **actionItems**: Tasks and improvements with type and priority
- **promptingTips**: Specific suggestions for better prompts with examples
- **interactionPatterns**: Analysis of communication effectiveness
- **technicalDetails**: Frameworks, issues, and solutions mentioned
- **conversationQuality**: Overall quality assessment with improvement suggestions

## Adding New Examples

When adding new examples:

1. Ensure the conversation demonstrates a clear pattern or issue
2. Include realistic, complete content (no placeholders)
3. Match the exact schema structure of existing examples
4. Include all `...Improvement` fields in `conversationQuality` (can be null if not applicable)
5. Provide specific, actionable prompting tips with before/after examples

## Build Process

These files are compiled into `prompt-assets.ts` during build time by running:

```bash
bun run scripts/generate-prompt-assets.ts
```

This ensures prompts are embedded in the build rather than loaded at runtime.

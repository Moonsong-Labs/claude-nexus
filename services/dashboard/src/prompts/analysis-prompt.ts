/**
 * Prompt template for AI conversation analysis
 */

export const CONVERSATION_ANALYSIS_PROMPT = `You are an AI assistant tasked with analyzing a conversation. 
Analyze the following conversation and provide a comprehensive analysis in JSON format.

IMPORTANT: Respond ONLY with a valid JSON object. No additional text, explanations, or markdown.
Your entire response must be a single JSON object that can be parsed with JSON.parse().

Conversation Messages:
{messages}

Required JSON structure:
{
  "summary": "2-3 sentence executive summary of the conversation",
  "keyTopics": ["array", "of", "main", "topics", "discussed"],
  "sentiment": "positive|neutral|negative|mixed",
  "userIntent": "Primary goal or intent of the user",
  "outcomes": ["What was achieved", "What remains unresolved"],
  "actionItems": ["Specific follow-up actions if any"],
  "technicalDetails": {
    "language": "programming language if applicable or null",
    "frameworks": ["frameworks or libraries mentioned"] or [],
    "errors": ["any errors or issues discussed"] or []
  },
  "conversationQuality": {
    "clarity": 8,
    "completeness": 7,
    "resolution": true
  }
}`

/**
 * Alternative prompts for different analysis types (future extension)
 */
export const ANALYSIS_PROMPTS = {
  default: CONVERSATION_ANALYSIS_PROMPT,

  technical: `You are an AI assistant tasked with technical analysis of a conversation.
Focus on technical aspects, code quality, architecture decisions, and implementation details.

IMPORTANT: Respond ONLY with a valid JSON object. No additional text, explanations, or markdown.

Conversation Messages:
{messages}

Required JSON structure:
{
  "summary": "Technical summary of the conversation",
  "codeQuality": ["observations about code quality"],
  "architectureDecisions": ["key architectural choices discussed"],
  "technicalChallenges": ["technical problems encountered"],
  "solutions": ["solutions implemented or proposed"],
  "bestPractices": ["best practices followed or violated"],
  "technicalDebt": ["potential technical debt identified"],
  "performanceConsiderations": ["performance-related discussions"]
}`,

  support: `You are an AI assistant tasked with analyzing a support conversation.
Focus on user satisfaction, problem resolution, and support quality.

IMPORTANT: Respond ONLY with a valid JSON object. No additional text, explanations, or markdown.

Conversation Messages:
{messages}

Required JSON structure:
{
  "summary": "Support case summary",
  "userProblem": "The main issue the user is facing",
  "resolution": "How the issue was resolved or current status",
  "supportQuality": {
    "responseTime": "fast|moderate|slow",
    "helpfulness": 8,
    "clarity": 7,
    "empathy": 9
  },
  "userSatisfaction": "satisfied|neutral|unsatisfied|unknown",
  "followUpNeeded": true,
  "escalationRequired": false
}`,
}

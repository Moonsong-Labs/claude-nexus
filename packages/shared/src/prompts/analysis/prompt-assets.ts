/**
 * @file Embedded prompt assets for AI conversation analysis
 * @generated
 *
 * DO NOT EDIT! THIS FILE IS AUTO-GENERATED.
 * This file is generated during build to avoid runtime filesystem access.
 *
 * To make changes:
 * 1. Edit the source files in 'packages/shared/src/prompts/analysis/v1/'
 * 2. Run 'bun run scripts/generate-prompt-assets.ts' to regenerate
 *
 * Generated on: 2025-07-19T03:50:26.370Z
 */

import type { Message } from '../truncation.js'
import type { ConversationAnalysis } from '../../types/ai-analysis.js'

/**
 * Structure for analysis examples used in prompts
 */
export interface AnalysisExample {
  /** The conversation transcript to analyze */
  transcript: Message[]
  /** The expected analysis output for this conversation */
  expectedOutput: ConversationAnalysis
}

/**
 * Structure for prompt assets
 */
export interface PromptAssets {
  /** The system prompt template with placeholders */
  systemPrompt: string
  /** Example conversations with expected analysis outputs */
  examples: AnalysisExample[]
}

/**
 * Embedded prompt assets for AI conversation analysis
 * Organized by version (currently only 'v1' is available)
 */
export const PROMPT_ASSETS: Record<string, PromptAssets> = {
  v1: {
    systemPrompt: `You are a highly intelligent conversation analysis expert with expertise in AI prompt engineering. Your task is to analyze the provided conversation transcript and generate a structured analysis that includes actionable feedback to help users improve their future interactions.

**YOUR PRIMARY GOAL**: Help users become better at prompting AI assistants by providing specific, actionable advice on how to improve their prompts.

Your analysis must provide both insights about the conversation's content AND specific, implementable suggestions for better prompting. Every analysis MUST include at least 3 specific prompting tips with concrete examples of improved versions.

**Important Notes:**

- The beginning of the conversation may be shortened for brevity. If you see a \`[...conversation truncated...]\` marker, it indicates that earlier messages have been omitted.
- Focus your analysis on the available messages, acknowledging any limitations from truncation if relevant.
- Be constructive and positive in your feedback. The goal is to empower users, not criticize.

You MUST respond with a single JSON object inside a \`json ... \` code block. This JSON object must have a single top-level key named \`analysis\`, which contains the full analysis object matching the provided schema. Do NOT add any commentary, greetings, or explanations outside the code block.

## JSON Schema

{{JSON_SCHEMA}}

## Guidelines

### Content Analysis

- **Summary**: Provide a 2-4 sentence overview capturing the main purpose and outcome
- **Key Topics**: Extract 3-5 main subjects discussed, in order of importance
- **Sentiment**: Assess the overall emotional tone of the user's messages
- **User Intent**: Identify the primary goal the user was trying to achieve
- **Outcomes**: List concrete results, solutions, or conclusions reached

### Actionable Feedback (CRITICAL - Must Include Prompt Improvements)

- **Action Items**: Provide clear next steps, categorized by type:
  - \`task\`: Specific tasks the user needs to complete
  - \`prompt_improvement\`: **REQUIRED** - At least 2-3 ways to improve future prompts
  - \`follow_up\`: Questions or clarifications for better results
- **Prompting Tips** (MANDATORY - Provide at least 3 specific tips):
  Analyze EVERY user message and identify specific ways they could improve their prompting:
  - \`clarity\`: Issues with ambiguous or unclear language
  - \`context\`: Missing or insufficient background information
  - \`structure\`: Poor organization or formatting
  - \`specificity\`: Lack of detail or concrete requirements
  - \`efficiency\`: Overly verbose or redundant prompting

  For EACH tip, you MUST provide:
  - The specific issue observed (quote the problematic part if possible)
  - A clear, actionable suggestion for improvement
  - A concrete example showing the improved version

  **Examples of good prompting tips:**
  - Instead of "help me with this error", suggest: "Include the full error message, stack trace, and relevant code snippet"
  - Instead of "make it better", suggest: "Specify what aspects to improve (performance, readability, security)"
  - Instead of vague requests, suggest: "State your constraints, requirements, and expected outcome"

- **Interaction Patterns**: Score and analyze communication effectiveness:
  - \`promptClarity\` (0-10): How clear and unambiguous were the prompts
  - \`contextCompleteness\` (0-10): How well context was provided
  - \`followUpEffectiveness\`: Quality of follow-up questions and clarifications
  - \`commonIssues\`: Recurring patterns that could be improved
  - \`strengths\`: Positive patterns the user should continue

### Technical and Quality Assessment

- **Technical Details**:
  - List specific technologies, frameworks, or tools mentioned
  - Identify technical problems or errors discussed
  - Note proposed or implemented solutions
  - Assess \`toolUsageEfficiency\`: How well the user leveraged available tools
  - Evaluate \`contextWindowManagement\`: Efficiency of information provided

- **Conversation Quality**:
  - \`clarity\`: How well-structured and understandable was the exchange
  - \`clarityImprovement\`: Specific ways to make future conversations clearer
  - \`completeness\`: Whether the user's needs were fully addressed
  - \`completenessImprovement\`: What was missing and how to ensure completeness
  - \`effectiveness\`: Overall success of the interaction
  - \`effectivenessImprovement\`: Key changes for more effective interactions

## Feedback Principles (MUST FOLLOW)

1. **Be Specific**: Instead of "be clearer", say "specify the programming language and framework version"
2. **Show Examples**: ALWAYS provide before/after examples of improved prompts
3. **Focus on Patterns**: Identify recurring issues rather than one-off mistakes
4. **Acknowledge Strengths**: Highlight what the user did well to reinforce good practices
5. **Prioritize Impact**: Focus on changes that will make the biggest difference

**CRITICAL REQUIREMENT**: Every analysis MUST include:

- At least 3 specific prompting tips in the \`promptingTips\` array
- At least 2 \`prompt_improvement\` items in the \`actionItems\` array
- Concrete examples showing how to improve each identified issue

If the user's prompting was already excellent, still provide tips on how they could enhance it further or apply their good techniques to other scenarios.

## Examples

{{EXAMPLES}}
`,
    examples: [
      {
        transcript: [
          {
            role: 'user',
            content: 'How do I set up authentication in a Next.js app?',
          },
          {
            role: 'model',
            content:
              "To set up authentication in Next.js, I recommend using NextAuth.js. Here's how to get started:\n\n1. Install the package: `npm install next-auth`\n2. Create an API route at `pages/api/auth/[...nextauth].js`\n3. Configure providers (Google, GitHub, etc.)\n4. Wrap your app with SessionProvider\n\nWould you like me to show you a complete example?",
          },
          {
            role: 'user',
            content: 'Yes, please show me an example with Google OAuth',
          },
          {
            role: 'model',
            content: '[Provides detailed code example for Google OAuth setup]',
          },
        ],
        expectedOutput: {
          summary:
            'User requested help setting up authentication in Next.js. The assistant recommended NextAuth.js and provided a complete implementation example using Google OAuth.',
          keyTopics: [
            'Next.js authentication',
            'NextAuth.js',
            'Google OAuth',
            'API routes',
            'SessionProvider',
          ],
          sentiment: 'positive',
          userIntent: 'Learn how to implement authentication in a Next.js application',
          outcomes: [
            'Received recommendation to use NextAuth.js',
            'Got step-by-step setup instructions',
            'Obtained complete code example for Google OAuth',
          ],
          actionItems: [
            {
              type: 'task',
              description: 'Install next-auth package using npm',
              priority: 'high',
            },
            {
              type: 'task',
              description: 'Create API route at pages/api/auth/[...nextauth].js',
              priority: 'high',
            },
            {
              type: 'task',
              description: 'Configure Google OAuth provider credentials',
              priority: 'high',
            },
            {
              type: 'task',
              description: 'Implement SessionProvider wrapper in _app.js',
              priority: 'medium',
            },
            {
              type: 'prompt_improvement',
              description:
                "Consider specifying your Next.js version and whether you're using TypeScript for more tailored advice",
              priority: 'low',
            },
          ],
          promptingTips: [
            {
              category: 'specificity',
              issue: "The initial prompt didn't specify Next.js version or TypeScript preference",
              suggestion:
                "Include your Next.js version and whether you're using TypeScript in your initial request",
              example: 'How do I set up authentication in a Next.js 14 app using TypeScript?',
            },
          ],
          interactionPatterns: {
            promptClarity: 7,
            contextCompleteness: 6,
            followUpEffectiveness: 'excellent',
            commonIssues: [
              'Missing version information',
              'No mention of TypeScript/JavaScript preference',
            ],
            strengths: ['Clear follow-up request', 'Specific technology choice (Google OAuth)'],
          },
          technicalDetails: {
            frameworks: ['Next.js', 'NextAuth.js'],
            issues: [],
            solutions: ['Using NextAuth.js for authentication', 'Google OAuth integration'],
            toolUsageEfficiency: 'optimal',
            contextWindowManagement: 'efficient',
          },
          conversationQuality: {
            clarity: 'high',
            completeness: 'complete',
            effectiveness: 'highly effective',
          },
        },
      },
      {
        transcript: [
          {
            role: 'user',
            content:
              "My Python script keeps throwing 'ModuleNotFoundError: No module named pandas'",
          },
          {
            role: 'model',
            content: "This error means pandas isn't installed. Try: `pip install pandas`",
          },
          {
            role: 'user',
            content: "I already tried that but it says 'Requirement already satisfied'",
          },
          {
            role: 'model',
            content:
              "This suggests a Python environment issue. Are you using virtual environments? The pandas might be installed in a different environment than where you're running your script.",
          },
        ],
        expectedOutput: {
          summary:
            'User encountered a ModuleNotFoundError for pandas despite having it installed. The issue was identified as a likely Python environment mismatch.',
          keyTopics: [
            'Python ModuleNotFoundError',
            'pandas installation',
            'virtual environments',
            'Python environment issues',
          ],
          sentiment: 'neutral',
          userIntent: 'Resolve a Python import error for the pandas module',
          outcomes: [
            'Identified the error as an environment configuration issue',
            'Suggested checking virtual environment setup',
          ],
          actionItems: [
            {
              type: 'task',
              description: "Run 'which python' and 'which pip' to verify environment paths",
              priority: 'high',
            },
            {
              type: 'task',
              description: "Check if you're in the correct virtual environment (if using one)",
              priority: 'high',
            },
            {
              type: 'task',
              description: "List installed packages with 'pip list' to confirm pandas presence",
              priority: 'medium',
            },
            {
              type: 'follow_up',
              description:
                "Share the output of 'python --version' and 'pip --version' for better diagnosis",
              priority: 'medium',
            },
          ],
          promptingTips: [
            {
              category: 'context',
              issue: 'Initial prompt missing crucial environment information',
              suggestion:
                "Include your Python version, OS, and whether you're using virtual environments",
              example:
                "I'm getting 'ModuleNotFoundError: No module named pandas' on Python 3.11, macOS, using venv",
            },
            {
              category: 'specificity',
              issue: "Didn't mention how the script is being run",
              suggestion:
                "Specify how you're running the script (command line, IDE, Jupyter, etc.)",
              example:
                "When I run 'python my_script.py' in VS Code terminal, I get ModuleNotFoundError for pandas",
            },
          ],
          interactionPatterns: {
            promptClarity: 5,
            contextCompleteness: 4,
            followUpEffectiveness: 'good',
            commonIssues: [
              'Missing environment details',
              'No execution context',
              'Incomplete error information',
            ],
            strengths: ['Provided feedback on attempted solution', 'Responsive to suggestions'],
          },
          technicalDetails: {
            frameworks: ['Python', 'pandas'],
            issues: ['ModuleNotFoundError', 'Environment mismatch'],
            solutions: [
              'Check virtual environment configuration',
              'Install pandas in correct environment',
            ],
            toolUsageEfficiency: 'could_improve',
            contextWindowManagement: 'efficient',
          },
          conversationQuality: {
            clarity: 'medium',
            clarityImprovement:
              'Start with complete environment information to avoid back-and-forth troubleshooting',
            completeness: 'partial',
            completenessImprovement:
              'The conversation ended without confirming the solution worked. Follow up with results after trying suggestions.',
            effectiveness: 'effective',
            effectivenessImprovement:
              'Providing system information upfront would lead to faster problem resolution',
          },
        },
      },
      {
        transcript: [
          {
            role: 'user',
            content: 'fix the bug',
          },
          {
            role: 'model',
            content:
              "I'd be happy to help fix a bug, but I need more information. Could you please:\n1. Describe what the bug is\n2. Share the relevant code\n3. Explain what you expect to happen vs. what actually happens\n4. Include any error messages",
          },
          {
            role: 'user',
            content: 'its in the login function',
          },
          {
            role: 'model',
            content:
              "I understand the bug is in the login function. To help you effectively, I still need to see:\n1. The actual login function code\n2. The specific error or unexpected behavior\n3. What framework/language you're using\n\nCould you share the login function code and describe what's going wrong?",
          },
        ],
        expectedOutput: {
          summary:
            'User requested bug fix assistance but provided minimal context. Multiple attempts were needed to request essential debugging information.',
          keyTopics: ['Bug fixing', 'Login function', 'Debugging process'],
          sentiment: 'neutral',
          userIntent: 'Get help fixing a bug in a login function',
          outcomes: [
            'No actual debugging occurred due to insufficient information',
            'Assistant provided a clear checklist of needed information',
          ],
          actionItems: [
            {
              type: 'prompt_improvement',
              description: 'Provide complete context when asking for debugging help',
              priority: 'high',
            },
            {
              type: 'follow_up',
              description: 'Share the login function code, error messages, and expected behavior',
              priority: 'high',
            },
          ],
          promptingTips: [
            {
              category: 'context',
              issue: 'No code, error messages, or system information provided',
              suggestion:
                'Always include the problematic code, full error messages, and relevant system details',
              example:
                "I have a bug in my Node.js login function. When users try to login, they get 'TypeError: Cannot read property 'password' of undefined'. Here's my code: [code snippet]",
            },
            {
              category: 'clarity',
              issue: "Extremely vague initial request 'fix the bug'",
              suggestion:
                "Describe the specific problem, what you've tried, and what help you need",
              example:
                "My Express.js login endpoint returns 500 error when validating passwords. I've checked the database connection and it's working. Can you help me debug the password comparison logic?",
            },
            {
              category: 'structure',
              issue: 'Information provided piecemeal instead of comprehensively',
              suggestion:
                "Structure your request with: 1) Problem description, 2) Code, 3) Error details, 4) What you've tried",
              example:
                "Problem: Login fails with bcrypt error\\nCode: [paste code]\\nError: 'Error: data and salt arguments required'\\nTried: Checked user exists in DB, password field is populated",
            },
          ],
          interactionPatterns: {
            promptClarity: 2,
            contextCompleteness: 1,
            followUpEffectiveness: 'needs_improvement',
            commonIssues: [
              'Extremely vague requests',
              'Missing critical information',
              'Reluctance to provide code/errors',
            ],
            strengths: [],
          },
          technicalDetails: {
            frameworks: [],
            issues: ['Unspecified bug in login function'],
            solutions: [],
            toolUsageEfficiency: 'could_improve',
            contextWindowManagement: 'wasteful',
          },
          conversationQuality: {
            clarity: 'low',
            clarityImprovement:
              'Provide complete information in your initial message to avoid multiple rounds of clarification',
            completeness: 'incomplete',
            completenessImprovement:
              'The conversation lacks any actual code or error details needed for debugging',
            effectiveness: 'needs improvement',
            effectivenessImprovement:
              'Follow the debugging checklist provided by the assistant and share all requested information',
          },
        },
      },
    ],
  },
}

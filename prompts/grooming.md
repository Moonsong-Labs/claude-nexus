<instructions>
Please groom the repository for code quality:

1. Identify and fix code smells, anti-patterns, and inconsistencies and long files.
2. Refactor for clarity and maintainability.
3. Ensure code follows project conventions.
4. Run and verify all tests and linters.
5. Summarize key improvements made and make a PR with title starting with exactly "[grooming]" followed by meaningful title
</instructions>

<important>
* When having doubt with best practice, search through perplexify tools
* When changes are required, spawn a sub-agent in parallel with meaningful context and the goal of the change. Ask the sub-agent to also involve gemini and o3 for additional review
</important>

<pre-requirements>
Except if specified otherwise, you should git checkout main and pull to ensure latest code version.
You should read documentation files (like the grooming docs)
</pre-requirements>

<previous-grooming>
!`gh pr list --state closed --search "in:title [grooming]" --limit 1 --json body,title,createdAt --jq '.[0] | "Created: \(.createdAt)\nTitle: \(.title)\n\nDescription:\n\(.body)"'`
</previous-grooming>

<grooming-history>
!`gh pr list --state closed --limit 10 --json body,title,createdAt --jq '.[] | "\(.createdAt) - \(.title)"'`
</grooming-history>

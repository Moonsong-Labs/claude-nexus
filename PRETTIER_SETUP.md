# Prettier Setup

Prettier has been configured for consistent code formatting across the project.

## Configuration

The project uses the following Prettier settings (`.prettierrc.json`):

- **No semicolons** (`semi: false`)
- **Single quotes** (`singleQuote: true`)
- **2 space indentation** (`tabWidth: 2`)
- **Trailing commas in ES5-compatible places** (`trailingComma: 'es5'`)
- **100 character line width** (`printWidth: 100`)
- **No parentheses around single arrow function parameters** (`arrowParens: 'avoid'`)

## Available Commands

```bash
# Format all files
bun run format

# Check formatting without making changes
bun run format:check

# Pre-commit check (runs typecheck + format check)
bun run precommit
```

## VS Code Integration

To enable automatic formatting in VS Code, add to your `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Git Hooks

To ensure consistent formatting, you can set up a pre-commit hook:

```bash
# Create pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
bun run precommit
EOF

# Make it executable
chmod +x .git/hooks/pre-commit
```

## Ignored Files

Prettier ignores files specified in `.prettierignore`:

- Dependencies (`node_modules`, `.yarn`)
- Build outputs (`dist`, `build`)
- Environment files (`.env*`)
- Lock files (`bun.lockb`, `package-lock.json`)
- Temporary files and logs

## Formatting Existing Code

To format all existing code in the project:

```bash
# Check what would be changed
bun run format:check

# Apply formatting
bun run format
```

Note: Formatting all files may create a large diff. Consider formatting in stages or as part of a dedicated formatting commit.

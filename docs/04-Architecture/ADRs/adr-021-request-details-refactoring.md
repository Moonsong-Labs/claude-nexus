# ADR-021: Request Details Page Refactoring

## Status

Accepted

## Context

The `request-details.ts` file in the dashboard service had grown to 1242 lines, making it difficult to maintain and understand. The file contained:

- Mixed responsibilities (routing, HTML generation, data processing, UI logic)
- 500+ lines of inline JavaScript embedded in HTML strings
- Repetitive code patterns
- Poor type safety with many `any` types
- No separation of concerns

## Decision

We refactored the request details page following these principles:

1. **Component Extraction**: Create reusable TypeScript components for UI elements
2. **Script Organization**: Consolidate JavaScript into organized modules
3. **Type Safety**: Replace `any` types with proper TypeScript interfaces
4. **Pragmatic Approach**: Work within existing infrastructure constraints (no static file serving)

### Components Created

- `copy-button.ts` - Reusable copy-to-clipboard button
- `navigation-arrows.ts` - User message navigation component
- `request-summary.ts` - Request metadata display component
- `view-toggle.ts` - View switching controls

### Scripts Organized

- `request-details-scripts.ts` - Consolidated client-side JavaScript

### Types Defined

- `request-details.ts` - TypeScript interfaces for request data

## Consequences

### Positive

- **58% reduction in file size** (1242 → 515 lines)
- **Better maintainability** through component separation
- **Improved type safety** with proper TypeScript types
- **Reusable components** for future development
- **No infrastructure changes** required
- **Preserved all functionality** without breaking changes

### Negative

- JavaScript remains inline (due to lack of static file serving)
- Some components need `raw()` wrapper for Hono HTML escaping
- Additional files to maintain (mitigated by better organization)

### Trade-offs

- Chose pragmatic refactoring over ideal architecture to avoid infrastructure changes
- Kept JavaScript inline rather than setting up static file serving
- Used string return types for components instead of Hono's HtmlEscapedString

## Implementation Details

### Before

```typescript
// Single 1242-line file with everything mixed together
requestDetailsRoutes.get('/request/:id', async c => {
  // ... hundreds of lines of mixed logic and HTML ...
})
```

### After

```typescript
// Clean route handler using components
requestDetailsRoutes.get('/request/:id', async c => {
  // ... data fetching ...

  const content = html`
    ${raw(requestSummary({ details, conversation, cost, toolUsage }))} ${raw(viewToggle())}
    <!-- ... other components ... -->
    <script>
      ${getRequestDetailsScripts()}
    </script>
  `

  return c.html(layout('Request Details', content))
})
```

## Lessons Learned

1. **Incremental refactoring** within constraints is often better than ideal but disruptive changes
2. **Component extraction** significantly improves readability even without perfect separation
3. **Type safety** can be improved gradually without full rewrite
4. **Infrastructure constraints** should guide refactoring approach

## Future Considerations

- If static file serving is added, JavaScript can be extracted to external files
- Components could be further refined with a proper component library
- Consider using a build step for client-side assets
- Evaluate moving to a more structured frontend framework if complexity continues to grow

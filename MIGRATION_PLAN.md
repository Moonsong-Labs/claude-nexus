# Migration Plan: Old Monolithic → New Modular Architecture

## Current State
- **Production Entry Point**: `src/server.ts` → `src/index.ts` (monolithic, 1200+ lines)
- **New Architecture**: Complete but unused (`src/app.ts`, services/*, controllers/*)
- **Risk**: Two parallel implementations causing confusion

## Migration Steps

### Phase 1: Testing (Immediate)
1. Test new architecture with existing test suites
2. Compare behavior between old and new implementations
3. Ensure feature parity

### Phase 2: Gradual Rollout
1. **Option A - Canary Deployment**:
   ```bash
   # Run both versions on different ports
   PORT=3000 bun run src/server.ts        # Old (production)
   PORT=3001 bun run src/server-new.ts    # New (testing)
   ```

2. **Option B - Feature Flag**:
   ```typescript
   // In src/server.ts
   const app = process.env.USE_NEW_ARCHITECTURE === 'true' 
     ? await import('./app').then(m => m.createApp())
     : await import('./index').then(m => m.default)
   ```

### Phase 3: Switch Over
1. Update `package.json`:
   ```json
   {
     "scripts": {
       "start": "bun run --hot src/app.ts",
       "build": "bun build ./src/server-new.ts --outfile=./bin --target=node --format=esm --banner='#!/usr/bin/env node'"
     }
   }
   ```

2. Update Dockerfiles to use new entry point

3. Archive old files:
   ```bash
   mkdir src/legacy
   mv src/index.ts src/legacy/index-old.ts
   mv src/server.ts src/legacy/server-old.ts
   mv src/server-new.ts src/server.ts
   ```

### Phase 4: Cleanup
1. Remove legacy code after stable deployment
2. Update documentation
3. Remove migration flags

## Validation Checklist
- [ ] All API endpoints work identically
- [ ] Token tracking functions correctly
- [ ] Slack notifications work
- [ ] Storage service works
- [ ] OAuth authentication works
- [ ] Rate limiting works
- [ ] Health checks work
- [ ] Graceful shutdown works

## Rollback Plan
If issues arise:
1. Revert to old entry point in package.json
2. Redeploy with old Docker image
3. Investigate issues in staging environment
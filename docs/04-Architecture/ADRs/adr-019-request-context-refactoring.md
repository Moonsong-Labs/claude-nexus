# ADR-019: RequestContext Value Object Refactoring

## Status

Accepted

## Context

The `RequestContext` value object was originally implemented with several design issues that compromised its quality as a domain value object:

1. **Framework coupling**: The class contained a reference to `honoContext`, coupling it to the Hono framework
2. **Incomplete immutability**: While properties were marked `readonly`, the headers object could be mutated
3. **Mixed responsibilities**: Factory logic (`fromHono`) was embedded in the value object itself
4. **Lack of validation**: No validation of required fields
5. **Limited utility methods**: Missing helpful methods for common operations
6. **Insufficient documentation**: Lacked comprehensive JSDoc comments

## Decision

We refactored `RequestContext` to be a pure, immutable value object following domain-driven design principles:

### Changes Made:

1. **Removed framework coupling**
   - Removed `honoContext` property from the value object
   - Moved `fromHono` factory method to a separate `RequestContextFactory` class

2. **Enforced immutability**
   - Made headers truly immutable using `Object.freeze()` on a shallow copy
   - Used a private `_headers` property with a getter to prevent direct access

3. **Added validation**
   - Validate all required fields in the constructor
   - Throw descriptive errors for missing or invalid data

4. **Improved documentation**
   - Added comprehensive JSDoc comments for the class and all methods
   - Included usage examples

5. **Added utility methods**
   - `hasApiKey()`: Check if request has an API key
   - `isFromDomain(domain)`: Check if request is from a specific domain (case-insensitive)

6. **Created RequestContextFactory**
   - `fromHono(c: Context)`: Create from Hono context
   - `forTesting(partial)`: Create for testing with sensible defaults

### Updated Architecture:

```
┌─────────────────────┐         ┌──────────────────────┐
│   MessageController │────────▶│ RequestContextFactory│
└─────────────────────┘         └──────────────────────┘
           │                                │
           │                                │ creates
           ▼                                ▼
┌─────────────────────┐         ┌──────────────────────┐
│    ProxyService     │◀────────│   RequestContext     │
└─────────────────────┘         └──────────────────────┘
```

## Consequences

### Positive

- **Better separation of concerns**: Value object is now purely focused on holding request metadata
- **Framework independence**: RequestContext can be used without any web framework dependencies
- **Improved testability**: Factory pattern makes it easier to create test instances
- **Type safety**: Validation ensures all RequestContext instances are valid
- **True immutability**: Headers cannot be modified after creation

### Negative

- **Breaking change**: Existing code using `RequestContext.fromHono()` must be updated
- **Additional file**: New `RequestContextFactory` class adds one more file to maintain

### Migration Required

- Update all `RequestContext.fromHono(c)` calls to `RequestContextFactory.fromHono(c)`
- Update test code to use `RequestContextFactory.forTesting()`
- Pass Hono context separately to services that need it (e.g., for test sample collection)

## References

- Domain-Driven Design principles for value objects
- SOLID principles (Single Responsibility)
- Factory pattern for object creation

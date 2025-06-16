/**
 * Custom error types for better error handling and debugging
 */
export class BaseError extends Error {
    code;
    statusCode;
    timestamp;
    context;
    constructor(code, message, statusCode = 500, context) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = this.constructor.name;
        this.timestamp = new Date();
        this.context = context;
        Error.captureStackTrace(this, this.constructor);
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            context: this.context,
            stack: this.stack
        };
    }
}
export class ValidationError extends BaseError {
    constructor(message, context) {
        super('VALIDATION_ERROR', message, 400, context);
    }
}
export class AuthenticationError extends BaseError {
    constructor(message, context) {
        super('AUTHENTICATION_ERROR', message, 401, context);
    }
}
export class AuthorizationError extends BaseError {
    constructor(message, context) {
        super('AUTHORIZATION_ERROR', message, 403, context);
    }
}
export class NotFoundError extends BaseError {
    constructor(message, context) {
        super('NOT_FOUND', message, 404, context);
    }
}
export class RateLimitError extends BaseError {
    retryAfter;
    constructor(message, retryAfter, context) {
        super('RATE_LIMIT_ERROR', message, 429, context);
        this.retryAfter = retryAfter;
    }
}
export class UpstreamError extends BaseError {
    upstreamStatus;
    constructor(message, upstreamStatus, context) {
        super('UPSTREAM_ERROR', message, 502, context);
        this.upstreamStatus = upstreamStatus;
    }
}
export class TimeoutError extends BaseError {
    constructor(message, context) {
        super('TIMEOUT_ERROR', message, 504, context);
    }
}
export class ConfigurationError extends BaseError {
    constructor(message, context) {
        super('CONFIGURATION_ERROR', message, 500, context);
    }
}
export class StorageError extends BaseError {
    constructor(message, context) {
        super('STORAGE_ERROR', message, 500, context);
    }
}
// Error handler middleware
export function isOperationalError(error) {
    if (error instanceof BaseError) {
        return true;
    }
    return false;
}
// Serialize error for API response
export function serializeError(error) {
    if (error instanceof BaseError) {
        return {
            error: {
                code: error.code,
                message: error.message,
                statusCode: error.statusCode,
                timestamp: error.timestamp,
                requestId: error.context?.requestId
            }
        };
    }
    // Handle non-operational errors
    return {
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            statusCode: 500,
            timestamp: new Date()
        }
    };
}

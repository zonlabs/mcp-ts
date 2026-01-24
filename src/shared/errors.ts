/**
 * Standardized error classes for MCP Redis library
 * Provides consistent error handling across the codebase
 */

/**
 * Base error class for all MCP-related errors
 */
export class McpError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'McpError';
        // Maintain proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            ...(this.cause ? { cause: this.cause.message } : {}),
        };
    }
}

/**
 * Thrown when OAuth authorization is required
 */
export class UnauthorizedError extends McpError {
    constructor(message: string = 'OAuth authorization required', cause?: Error) {
        super('UNAUTHORIZED', message, cause);
        this.name = 'UnauthorizedError';
    }
}

/**
 * Thrown when connection to MCP server fails
 */
export class ConnectionError extends McpError {
    constructor(message: string, cause?: Error) {
        super('CONNECTION_ERROR', message, cause);
        this.name = 'ConnectionError';
    }
}

/**
 * Thrown when session is not found or expired
 */
export class SessionNotFoundError extends McpError {
    constructor(sessionId: string, cause?: Error) {
        super('SESSION_NOT_FOUND', `Session not found: ${sessionId}`, cause);
        this.name = 'SessionNotFoundError';
    }
}

/**
 * Thrown when session validation fails
 */
export class SessionValidationError extends McpError {
    constructor(message: string, cause?: Error) {
        super('SESSION_VALIDATION_ERROR', message, cause);
        this.name = 'SessionValidationError';
    }
}

/**
 * Thrown when authentication fails
 */
export class AuthenticationError extends McpError {
    constructor(message: string, cause?: Error) {
        super('AUTH_ERROR', message, cause);
        this.name = 'AuthenticationError';
    }
}

/**
 * Thrown when OAuth state validation fails
 */
export class InvalidStateError extends McpError {
    constructor(message: string = 'Invalid OAuth state', cause?: Error) {
        super('INVALID_STATE', message, cause);
        this.name = 'InvalidStateError';
    }
}

/**
 * Thrown when client is not connected
 */
export class NotConnectedError extends McpError {
    constructor(message: string = 'Not connected to server', cause?: Error) {
        super('NOT_CONNECTED', message, cause);
        this.name = 'NotConnectedError';
    }
}

/**
 * Thrown when required configuration is missing
 */
export class ConfigurationError extends McpError {
    constructor(message: string, cause?: Error) {
        super('CONFIGURATION_ERROR', message, cause);
        this.name = 'ConfigurationError';
    }
}

/**
 * Thrown when tool execution fails
 */
export class ToolExecutionError extends McpError {
    constructor(toolName: string, message: string, cause?: Error) {
        super('TOOL_EXECUTION_ERROR', `Tool '${toolName}' failed: ${message}`, cause);
        this.name = 'ToolExecutionError';
    }
}

/**
 * RPC error codes for SSE communication
 */
export const RpcErrorCodes = {
    EXECUTION_ERROR: 'EXECUTION_ERROR',
    MISSING_IDENTITY: 'MISSING_IDENTITY',
    UNAUTHORIZED: 'UNAUTHORIZED',
    NO_CONNECTION: 'NO_CONNECTION',
    UNKNOWN_METHOD: 'UNKNOWN_METHOD',
    INVALID_PARAMS: 'INVALID_PARAMS',
} as const;

export type RpcErrorCode = typeof RpcErrorCodes[keyof typeof RpcErrorCodes];

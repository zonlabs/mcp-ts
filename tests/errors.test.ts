/**
 * Tests for error classes
 * Verifies error hierarchy and serialization
 */
import { test, expect } from '@playwright/test';
import {
    McpError,
    UnauthorizedError,
    ConnectionError,
    SessionNotFoundError,
    ToolExecutionError,
    RpcErrorCodes,
} from '../src/shared/errors';

test.describe('Error Classes', () => {
    test.describe('McpError', () => {
        test('should create error with code and message', () => {
            const error = new McpError('TEST_ERROR', 'Test error message');

            expect(error.code).toBe('TEST_ERROR');
            expect(error.message).toBe('Test error message');
            expect(error.name).toBe('McpError');
            expect(error instanceof Error).toBe(true);
        });

        test('should include cause when provided', () => {
            const cause = new Error('Original error');
            const error = new McpError('WRAPPER', 'Wrapped error', cause);

            expect(error.cause).toBe(cause);
        });

        test('should serialize to JSON', () => {
            const error = new McpError('JSON_TEST', 'Serializable error');
            const json = error.toJSON();

            expect(json.name).toBe('McpError');
            expect(json.code).toBe('JSON_TEST');
            expect(json.message).toBe('Serializable error');
        });
    });

    test.describe('UnauthorizedError', () => {
        test('should have correct defaults', () => {
            const error = new UnauthorizedError();

            expect(error.code).toBe('UNAUTHORIZED');
            expect(error.message).toBe('OAuth authorization required');
            expect(error.name).toBe('UnauthorizedError');
        });

        test('should accept custom message', () => {
            const error = new UnauthorizedError('Token expired');

            expect(error.message).toBe('Token expired');
        });
    });

    test.describe('ConnectionError', () => {
        test('should have CONNECTION_ERROR code', () => {
            const error = new ConnectionError('Failed to connect');

            expect(error.code).toBe('CONNECTION_ERROR');
            expect(error.name).toBe('ConnectionError');
        });
    });

    test.describe('SessionNotFoundError', () => {
        test('should include session ID in message', () => {
            const error = new SessionNotFoundError('abc123');

            expect(error.code).toBe('SESSION_NOT_FOUND');
            expect(error.message).toContain('abc123');
        });
    });

    test.describe('ToolExecutionError', () => {
        test('should include tool name in message', () => {
            const error = new ToolExecutionError('get_weather', 'API timeout');

            expect(error.code).toBe('TOOL_EXECUTION_ERROR');
            expect(error.message).toContain('get_weather');
            expect(error.message).toContain('API timeout');
        });
    });

    test.describe('RpcErrorCodes', () => {
        test('should expose standard error codes', () => {
            expect(RpcErrorCodes.EXECUTION_ERROR).toBe('EXECUTION_ERROR');
            expect(RpcErrorCodes.MISSING_IDENTITY).toBe('MISSING_IDENTITY');
            expect(RpcErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
            expect(RpcErrorCodes.NO_CONNECTION).toBe('NO_CONNECTION');
            expect(RpcErrorCodes.UNKNOWN_METHOD).toBe('UNKNOWN_METHOD');
            expect(RpcErrorCodes.INVALID_PARAMS).toBe('INVALID_PARAMS');
        });
    });
});

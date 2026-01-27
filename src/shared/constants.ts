/**
 * Centralized constants for MCP Redis library
 * Eliminates magic numbers and enables consistent configuration
 */

// Redis TTL and Session Management
export const SESSION_TTL_SECONDS = 43200; // 12 hours
export const STATE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes for OAuth state

// Heartbeat and Connection
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

// Redis Key Prefixes
export const REDIS_KEY_PREFIX = 'mcp:session:';

// Token Management
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer before expiry

// Client Information
export const DEFAULT_CLIENT_NAME = 'MCP Assistant';
export const DEFAULT_CLIENT_URI = 'https://mcp-assistant.in';
export const DEFAULT_LOGO_URI = 'https://mcp-assistant.in/logo.png';
export const DEFAULT_POLICY_URI = 'https://mcp-assistant.in/privacy';
export const SOFTWARE_ID = '@mcp-ts';
export const SOFTWARE_VERSION = '1.0.0-beta.5';

// MCP Client Configuration
export const MCP_CLIENT_NAME = 'mcp-ts-oauth-client';
export const MCP_CLIENT_VERSION = '2.0';

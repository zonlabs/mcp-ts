/**
 * Centralized constants for MCP TS library
 * Eliminates magic numbers and enables consistent configuration
 */

// Session lifecycle
export const STATE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes for OAuth state
export const PENDING_SESSION_EXPIRATION_SECONDS = Math.floor(STATE_EXPIRATION_MS / 1000);
export const DORMANT_SESSION_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const DORMANT_SESSION_EXPIRATION_SECONDS = Math.floor(DORMANT_SESSION_EXPIRATION_MS / 1000);

// Heartbeat and Connection
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

// Redis Key Prefixes
export const REDIS_KEY_PREFIX = 'mcp:session:';

// Client Information
export const DEFAULT_CLIENT_NAME = 'MCP Assistant';
export const DEFAULT_CLIENT_URI = 'https://mcp-assistant.in';
export const DEFAULT_LOGO_URI = 'https://mcp-assistant.in/logo.svg';
export const DEFAULT_POLICY_URI = 'https://mcp-assistant.in/privacy';
export const SOFTWARE_ID = '@mcp-ts';
export const SOFTWARE_VERSION = '2.6.2';

// MCP Client Configuration
export const MCP_CLIENT_NAME = 'mcp-ts-oauth-client';
export const MCP_CLIENT_VERSION = '2.0';

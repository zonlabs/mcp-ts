export interface Tool {
    name: string;
    description?: string;
}

export interface Connection {
    sessionId: string;
    serverName: string;
    serverId: string;
    serverUrl: string;
    transport?: string;
    state: string;
    error?: string;
    tools?: Tool[];
    createdAt?: Date | string | number;
    updatedAt?: Date | string | number;
}

export interface ConnectConfig {
    serverId?: string; // Optional - generated server-side if not provided
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    transportType: 'sse' | 'streamable-http' | 'auto';
    clientId?: string;
    clientSecret?: string;
}

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
}

export interface ConnectConfig {
    serverId: string;
    serverName: string;
    serverUrl: string;
    callbackUrl: string;
    transportType: 'sse' | 'streamable_http' | 'auto';
}

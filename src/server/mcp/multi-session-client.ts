
import { MCPClient } from './oauth-client.js';
import { storage, type SessionData } from '../storage/index.js';
import { Emitter, type Disposable, type Event } from '../../shared/events.js';

/**
 * Manages multiple MCP connections for a single user identity.
 * Allows aggregating tools from all connected servers.
 */
export interface MultiSessionOptions {
    /**
     * Connection timeout in milliseconds
     * @default 15000
     */
    timeout?: number;
    /**
     * Maximum number of retry attempts
     * @default 2
     */
    maxRetries?: number;
    /**
     * Delay between retries in milliseconds
     * @default 1000
     */
    retryDelay?: number;
}

export interface MultiSessionNotificationEvent {
    sessionId: string;
    serverId: string;
    method: string;
    params?: Record<string, unknown>;
    timestamp: number;
}

export interface MultiSessionProgressEvent extends MultiSessionNotificationEvent {
    method: 'notifications/progress';
    progress: number;
    total?: number;
    message?: string;
    progressToken?: string | number;
}

export interface MultiSessionLoggingEvent extends MultiSessionNotificationEvent {
    method: 'notifications/message';
    level?: string;
    data?: unknown;
    logger?: string;
}

export interface MultiSessionListChangedEvent extends MultiSessionNotificationEvent {
    method:
    | 'notifications/tools/list_changed'
    | 'notifications/resources/list_changed'
    | 'notifications/prompts/list_changed';
}

export interface MultiSessionResourceUpdatedEvent extends MultiSessionNotificationEvent {
    method: 'notifications/resources/updated';
    uri?: string;
}

export interface MultiSessionTaskStatusEvent extends MultiSessionNotificationEvent {
    method: 'notifications/tasks/status';
    taskId?: string;
    status?: string;
}

export interface MultiSessionNotificationHandlers {
    onNotification?: (event: MultiSessionNotificationEvent) => void;
    onProgress?: (event: MultiSessionProgressEvent) => void;
    onLoggingMessage?: (event: MultiSessionLoggingEvent) => void;
    onToolListChanged?: (event: MultiSessionListChangedEvent) => void;
    onResourceListChanged?: (event: MultiSessionListChangedEvent) => void;
    onPromptListChanged?: (event: MultiSessionListChangedEvent) => void;
    onResourceUpdated?: (event: MultiSessionResourceUpdatedEvent) => void;
    onTaskStatus?: (event: MultiSessionTaskStatusEvent) => void;
}

/**
 * Manages multiple MCP connections for a single user identity.
 * Allows aggregating tools from all connected servers.
 */
export class MultiSessionClient {
    private clients: MCPClient[] = [];
    private identity: string;
    private options: MultiSessionOptions;
    private readonly _onNotification = new Emitter<MultiSessionNotificationEvent>();
    private readonly _onProgress = new Emitter<MultiSessionProgressEvent>();
    private readonly _onLoggingMessage = new Emitter<MultiSessionLoggingEvent>();
    private readonly _onToolListChanged = new Emitter<MultiSessionListChangedEvent>();
    private readonly _onResourceListChanged = new Emitter<MultiSessionListChangedEvent>();
    private readonly _onPromptListChanged = new Emitter<MultiSessionListChangedEvent>();
    private readonly _onResourceUpdated = new Emitter<MultiSessionResourceUpdatedEvent>();
    private readonly _onTaskStatus = new Emitter<MultiSessionTaskStatusEvent>();
    private readonly notificationForwarders = new Map<string, Disposable>();

    public readonly onNotification: Event<MultiSessionNotificationEvent> = this._onNotification.event;
    public readonly onProgress: Event<MultiSessionProgressEvent> = this._onProgress.event;
    public readonly onLoggingMessage: Event<MultiSessionLoggingEvent> = this._onLoggingMessage.event;
    public readonly onToolListChanged: Event<MultiSessionListChangedEvent> = this._onToolListChanged.event;
    public readonly onResourceListChanged: Event<MultiSessionListChangedEvent> = this._onResourceListChanged.event;
    public readonly onPromptListChanged: Event<MultiSessionListChangedEvent> = this._onPromptListChanged.event;
    public readonly onResourceUpdated: Event<MultiSessionResourceUpdatedEvent> = this._onResourceUpdated.event;
    public readonly onTaskStatus: Event<MultiSessionTaskStatusEvent> = this._onTaskStatus.event;

    constructor(identity: string, options: MultiSessionOptions = {}) {
        this.identity = identity;
        this.options = {
            timeout: 15000,
            maxRetries: 2,
            retryDelay: 1000,
            ...options
        };
    }

    /**
     * Registers a notification handler object similar to FastMCP-style callbacks.
     */
    setNotificationHandlers(handlers: MultiSessionNotificationHandlers): Disposable {
        const subscriptions: Disposable[] = [];

        if (handlers.onNotification) {
            subscriptions.push(this.onNotification(handlers.onNotification));
        }

        if (handlers.onProgress) {
            subscriptions.push(this.onProgress(handlers.onProgress));
        }

        if (handlers.onLoggingMessage) {
            subscriptions.push(this.onLoggingMessage(handlers.onLoggingMessage));
        }

        if (handlers.onToolListChanged) {
            subscriptions.push(this.onToolListChanged(handlers.onToolListChanged));
        }

        if (handlers.onResourceListChanged) {
            subscriptions.push(this.onResourceListChanged(handlers.onResourceListChanged));
        }

        if (handlers.onPromptListChanged) {
            subscriptions.push(this.onPromptListChanged(handlers.onPromptListChanged));
        }

        if (handlers.onResourceUpdated) {
            subscriptions.push(this.onResourceUpdated(handlers.onResourceUpdated));
        }

        if (handlers.onTaskStatus) {
            subscriptions.push(this.onTaskStatus(handlers.onTaskStatus));
        }

        return {
            dispose: () => {
                subscriptions.forEach((subscription) => subscription.dispose());
            }
        };
    }

    private async getActiveSessions(): Promise<SessionData[]> {
        const sessions = await storage.getIdentitySessionsData(this.identity);
        console.log(`[MultiSessionClient] All sessions for ${this.identity}:`,
            sessions.map(s => ({ sessionId: s.sessionId, serverId: s.serverId }))
        );
        const valid = sessions.filter(s => s.serverId && s.serverUrl && s.callbackUrl);
        console.log(`[MultiSessionClient] Filtered valid sessions:`, valid.length);
        return valid;
    }

    private async connectInBatches(sessions: SessionData[]): Promise<void> {
        const BATCH_SIZE = 5;
        for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
            const batch = sessions.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(session => this.connectSession(session)));
        }
    }

    private async connectSession(session: SessionData): Promise<void> {
        const existingClient = this.clients.find(c => c.getSessionId() === session.sessionId);
        if (existingClient?.isConnected()) {
            return;
        }

        const maxRetries = this.options.maxRetries ?? 2;
        const retryDelay = this.options.retryDelay ?? 1000;
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const client = await this.createAndConnectClient(session);
                this.clients.push(client);
                return;
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        console.error(`[MultiSessionClient] Failed to connect to session ${session.sessionId} after ${maxRetries + 1} attempts:`, lastError);
    }

    private toNotificationParams(params: unknown): Record<string, unknown> | undefined {
        if (!params || typeof params !== 'object') {
            return undefined;
        }
        return params as Record<string, unknown>;
    }

    private fireTypedNotifications(event: MultiSessionNotificationEvent): void {
        const params = this.toNotificationParams(event.params);

        switch (event.method) {
            case 'notifications/progress': {
                const progress = params?.progress;
                if (typeof progress !== 'number') {
                    return;
                }

                this._onProgress.fire({
                    ...event,
                    method: 'notifications/progress',
                    progress,
                    total: typeof params?.total === 'number' ? params.total : undefined,
                    message: typeof params?.message === 'string' ? params.message : undefined,
                    progressToken:
                        typeof params?.progressToken === 'string' || typeof params?.progressToken === 'number'
                            ? params.progressToken
                            : undefined,
                });
                return;
            }
            case 'notifications/message':
                this._onLoggingMessage.fire({
                    ...event,
                    method: 'notifications/message',
                    level: typeof params?.level === 'string' ? params.level : undefined,
                    data: params?.data,
                    logger: typeof params?.logger === 'string' ? params.logger : undefined,
                });
                return;
            case 'notifications/tools/list_changed':
                this._onToolListChanged.fire({ ...event, method: 'notifications/tools/list_changed' });
                return;
            case 'notifications/resources/list_changed':
                this._onResourceListChanged.fire({ ...event, method: 'notifications/resources/list_changed' });
                return;
            case 'notifications/prompts/list_changed':
                this._onPromptListChanged.fire({ ...event, method: 'notifications/prompts/list_changed' });
                return;
            case 'notifications/resources/updated':
                this._onResourceUpdated.fire({
                    ...event,
                    method: 'notifications/resources/updated',
                    uri: typeof params?.uri === 'string' ? params.uri : undefined,
                });
                return;
            case 'notifications/tasks/status':
                this._onTaskStatus.fire({
                    ...event,
                    method: 'notifications/tasks/status',
                    taskId: typeof params?.taskId === 'string' ? params.taskId : undefined,
                    status: typeof params?.status === 'string' ? params.status : undefined,
                });
                return;
            default:
                return;
        }
    }

    private async createAndConnectClient(session: SessionData): Promise<MCPClient> {
        const client = new MCPClient({
            identity: this.identity,
            sessionId: session.sessionId,
            serverId: session.serverId,
            serverUrl: session.serverUrl,
            callbackUrl: session.callbackUrl,
            serverName: session.serverName,
            transportType: session.transportType,
            headers: session.headers,
        });

        const existingForwarder = this.notificationForwarders.get(session.sessionId);
        existingForwarder?.dispose();

        const forwarder = client.onServerNotification((event) => {
            this._onNotification.fire(event);
            this.fireTypedNotifications(event);
        });
        this.notificationForwarders.set(session.sessionId, forwarder);

        const timeoutMs = this.options.timeout ?? 15000;
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        await Promise.race([client.connect(), timeoutPromise]);
        return client;
    }

    async connect(): Promise<void> {
        const sessions = await this.getActiveSessions();
        await this.connectInBatches(sessions);
    }

    /**
     * Returns the array of currently connected clients.
     */
    getClients(): MCPClient[] {
        return this.clients;
    }

    /**
     * Disconnects all clients.
     */
    disconnect(): void {
        this.clients.forEach((client) => {
            const sessionId = client.getSessionId();
            this.notificationForwarders.get(sessionId)?.dispose();
            this.notificationForwarders.delete(sessionId);
            client.disconnect();
        });
        this.clients = [];
    }

    /**
     * Dispose this multi-session client and all event listeners.
     * Use this when the instance will no longer be reused.
     */
    dispose(): void {
        this.disconnect();
        this._onNotification.dispose();
    }
}

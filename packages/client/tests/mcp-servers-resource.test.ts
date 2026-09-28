import { test, expect } from '@playwright/test';
import { client, createClient, McpClient } from '../src/index.js';
import { MemoryStorageBackend } from '../src/server/storage/memory-backend.js';

test.describe('client.mcpServers API (v0-style)', () => {
  const userId = 'user_test_42';
  let storage: MemoryStorageBackend;
  let testClient: ReturnType<typeof createClient>;

  test.beforeEach(() => {
    storage = new MemoryStorageBackend();
    testClient = createClient({ storage });
  });

  test('creates MCP servers with different auth types and retrieves them', async () => {
    // 1. Create with Bearer auth
    const server1 = await testClient.mcpServers.create({
      userId,
      serverId: 'tavily_search',
      name: 'Tavily Search',
      url: 'https://mcp.tavily.com/mcp',
      description: 'Search tools for AI',
      auth: {
        type: 'bearer',
        token: 'tvly-secret-token',
      },
      metadata: {
        teamId: 'team_ai',
        category: 'web-search',
      },
    });

    expect(server1.id).toBe('tavily_search');
    expect(server1.object).toBe('mcp_server');
    expect(server1.name).toBe('Tavily Search');
    expect(server1.enabled).toBe(true);
    expect(server1.auth.type).toBe('bearer');
    expect(server1.metadata).toEqual({
      teamId: 'team_ai',
      category: 'web-search',
    });

    // 2. Create with Custom Headers auth
    const server2 = await testClient.mcpServers.create({
      userId,
      serverId: 'custom_api',
      name: 'Custom Internal MCP',
      url: 'https://mcp.internal.corp/sse',
      auth: {
        type: 'custom-headers',
        headers: {
          'X-API-Key': 'my-custom-key',
          'X-Tenant-ID': 'tenant_1',
        },
      },
    });

    expect(server2.id).toBe('custom_api');
    expect(server2.auth.type).toBe('custom-headers');

    // 3. Create with None auth
    const server3 = await testClient.mcpServers.create({
      userId,
      serverId: 'public_mcp',
      name: 'Public MCP Server',
      url: 'https://public.mcp.example/sse',
      auth: { type: 'none' },
    });

    expect(server3.auth.type).toBe('none');

    // 4. Find all
    const findRes = await testClient.mcpServers.find({ userId });
    expect(findRes.object).toBe('list');
    expect(findRes.data).toHaveLength(3);
    const ids = findRes.data.map((s) => s.id);
    expect(ids).toContain('tavily_search');
    expect(ids).toContain('custom_api');
    expect(ids).toContain('public_mcp');
  });

  test('filters servers by search query and enabled state', async () => {
    await testClient.mcpServers.create({
      userId,
      serverId: 's1',
      name: 'GitHub MCP',
      url: 'https://mcp.github.com/sse',
      description: 'Repositories and issues',
      enabled: true,
    });

    await testClient.mcpServers.create({
      userId,
      serverId: 's2',
      name: 'Slack MCP',
      url: 'https://mcp.slack.com/sse',
      description: 'Channels and chats',
      enabled: false,
    });

    // Filter by enabled
    const enabledOnly = await testClient.mcpServers.find({ userId, enabled: true });
    expect(enabledOnly.data).toHaveLength(1);
    expect(enabledOnly.data[0].id).toBe('s1');

    const disabledOnly = await testClient.mcpServers.find({ userId, enabled: false });
    expect(disabledOnly.data).toHaveLength(1);
    expect(disabledOnly.data[0].id).toBe('s2');

    // Filter by search
    const searched = await testClient.mcpServers.find({ userId, search: 'github' });
    expect(searched.data).toHaveLength(1);
    expect(searched.data[0].name).toBe('GitHub MCP');

    const searchedDesc = await testClient.mcpServers.find({ userId, search: 'channels' });
    expect(searchedDesc.data).toHaveLength(1);
    expect(searchedDesc.data[0].name).toBe('Slack MCP');
  });

  test('updates an existing MCP server partially', async () => {
    await testClient.mcpServers.create({
      userId,
      serverId: 'my_server',
      name: 'Initial Name',
      url: 'https://old.url.com/sse',
      enabled: true,
      metadata: { env: 'dev' },
    });

    const updated = await testClient.mcpServers.update({
      userId,
      serverId: 'my_server',
      name: 'Updated Name',
      enabled: false,
      metadata: { env: 'prod', region: 'us-east-1' },
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.enabled).toBe(false);
    expect(updated.metadata).toEqual({ env: 'prod', region: 'us-east-1' });

    // Verify retrieval by getById
    const fetched = await testClient.mcpServers.getById({ userId, serverId: 'my_server' });
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Updated Name');
    expect(fetched!.enabled).toBe(false);
  });

  test('deletes an MCP server and confirms removal', async () => {
    await testClient.mcpServers.create({
      userId,
      serverId: 'to_delete',
      name: 'Server To Delete',
      url: 'https://delete.me/sse',
    });

    const delRes = await testClient.mcpServers.delete({ userId, serverId: 'to_delete' });
    expect(delRes).toEqual({
      object: 'mcp_server',
      id: 'to_delete',
      deleted: true,
    });

    const fetched = await testClient.mcpServers.getById({ userId, serverId: 'to_delete' });
    expect(fetched).toBeNull();

    const listRes = await testClient.mcpServers.find({ userId });
    expect(listRes.data).toHaveLength(0);
  });

  test('supports resource aliases: client.mcpServers.list and client.mcpServers.get', async () => {
    await testClient.mcpServers.create({
      userId,
      serverId: 'alias_srv',
      name: 'Alias Test Server',
      url: 'https://alias.example.com/sse',
    });

    const fetched = await testClient.mcpServers.get({ userId, serverId: 'alias_srv' });
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe('alias_srv');

    const listed = await testClient.mcpServers.list({ userId });
    expect(listed.data.some((s) => s.id === 'alias_srv')).toBe(true);
  });

  test('client.mcpServers.discoverOAuth returns discovery details or error without mutating server state', async () => {
    // Non-OAuth server returns supported: false and descriptive error
    const nonOauth = await testClient.mcpServers.discoverOAuth({
      url: 'https://mcp.firecrawl.dev/v2/mcp',
    });
    expect(nonOauth.supported).toBe(false);
    expect(nonOauth.error).toContain('does not implement OAuth');

    // OAuth server returns supported: true and endpoints
    const oauthRes = await testClient.mcpServers.discoverOAuth({
      url: 'https://mcp.exa.ai/mcp?login',
    });
    expect(oauthRes.supported).toBe(true);
    expect(oauthRes.authorizationUrl).toBeTruthy();
    expect(oauthRes.tokenUrl).toBeTruthy();
  });

  test('client.mcpServers.create automatically resolves auth to none if server does not require OAuth', async () => {
    const srv = await testClient.mcpServers.create({
      userId,
      name: 'Firecrawl Auto Auth',
      url: 'https://mcp.firecrawl.dev/v2/mcp',
      auth: { type: 'oauth' },
    });

    expect(srv.status.state).toBe('connected');
    expect(srv.auth.type).toBe('none');

    // Subsequent retrieval also reflects auth type none
    const fetched = await testClient.mcpServers.getById({ userId, serverId: srv.id });
    expect(fetched?.auth.type).toBe('none');
    expect(fetched?.status.state).toBe('connected');
  });

  test('client.mcpServers.create with OAuth config preserves and derives config fields', async () => {
    const srv = await testClient.mcpServers.create({
      userId,
      serverId: 'oauth_configured',
      name: 'OAuth Configured Server',
      url: 'https://mcp.custom-oauth.org/sse',
      auth: {
        type: 'oauth',
        config: {
          clientId: 'client_123',
          clientSecret: 'secret_xyz_999',
          clientMetadataUrl: 'https://myapp.com/oauth/client-metadata.json',
          scopes: ['mcp:read', 'mcp:write'],
        },
      },
    });

    expect(srv.auth.type).toBe('oauth');
    if (srv.auth.type === 'oauth') {
      expect((srv.auth.config as any)?.clientId).toBeUndefined();
      expect((srv.auth.config as any)?.clientSecret).toBeUndefined();
      expect(srv.auth.config?.clientMetadataUrl).toBe('https://myapp.com/oauth/client-metadata.json');
      expect(srv.auth.config?.scopes).toEqual(['mcp:read', 'mcp:write']);
    }

    // Verify secret is securely saved in storage credentials, not in metadata.oauthConfig
    const all = await testClient.storage.list(userId);
    const stored = all.find((s) => s.serverId === 'oauth_configured');
    expect(stored).toBeDefined();
    const creds = await testClient.storage.getCredentials(userId, stored!.sessionId);
    const session = await testClient.storage.get(userId, stored!.sessionId);
    expect(creds?.clientInformation?.client_secret || (session as any)?.clientInformation?.client_secret).toBe('secret_xyz_999');
    expect(session?.metadata?.oauthConfig).not.toContain('secret_xyz_999');
  });

  test('executes capability APIs: listTools, callTool, listPrompts, getPrompt, listResources, readResource, listResourceTemplates', async () => {
    const originalConnect = (McpClient.prototype as any).connect;
    const originalListTools = (McpClient.prototype as any).listTools;
    const originalCallTool = (McpClient.prototype as any).callTool;
    const originalListPrompts = (McpClient.prototype as any).listPrompts;
    const originalGetPrompt = (McpClient.prototype as any).getPrompt;
    const originalListResources = (McpClient.prototype as any).listResources;
    const originalReadResource = (McpClient.prototype as any).readResource;
    const originalFetchTemplates = (McpClient.prototype as any).fetchResourceTemplates;

    (McpClient.prototype as any).connect = async function () {
      return;
    };
    (McpClient.prototype as any).listTools = async function () {
      return {
        tools: [
          {
            name: 'calculate_sum',
            description: 'Adds two numbers',
            inputSchema: { type: 'object' },
          },
        ],
      };
    };
    (McpClient.prototype as any).callTool = async function (name: string, args: Record<string, unknown>) {
      return {
        content: [{ type: 'text', text: `Result of ${name}: ${JSON.stringify(args)}` }],
      };
    };
    (McpClient.prototype as any).listPrompts = async function () {
      return {
        prompts: [{ name: 'code_review', description: 'Review pull request' }],
      };
    };
    (McpClient.prototype as any).getPrompt = async function (name: string, args?: Record<string, string>) {
      return {
        description: 'Review prompt',
        messages: [{ role: 'user', content: { type: 'text', text: `Reviewing: ${JSON.stringify(args)}` } }],
      };
    };
    (McpClient.prototype as any).listResources = async function () {
      return {
        resources: [{ uri: 'file:///workspace/readme.md', name: 'README' }],
      };
    };
    (McpClient.prototype as any).readResource = async function (uri: string) {
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: '# Sample Readme' }],
      };
    };
    (McpClient.prototype as any).fetchResourceTemplates = async function () {
      return [
        { uriTemplate: 'file:///{path}', name: 'Workspace File' },
      ];
    };

    try {
      await testClient.mcpServers.create({
        userId,
        serverId: 'calc_server',
        name: 'Calculation Server',
        url: 'https://calc.example.com/sse',
      });

      // 1. listTools
      const toolsRes = await testClient.mcpServers.listTools({ userId, serverId: 'calc_server' });
      expect(toolsRes.tools).toHaveLength(1);
      expect(toolsRes.tools[0].name).toBe('calculate_sum');

      // 2. callTool
      const callRes = await testClient.mcpServers.callTool({
        userId,
        serverId: 'calc_server',
        toolName: 'calculate_sum',
        args: { a: 10, b: 20 },
      });
      expect(callRes.content[0]).toEqual({
        type: 'text',
        text: 'Result of calculate_sum: {"a":10,"b":20}',
      });

      // 3. listPrompts
      const promptsRes = await testClient.mcpServers.listPrompts({ userId, serverId: 'calc_server' });
      expect(promptsRes.prompts).toHaveLength(1);
      expect(promptsRes.prompts[0].name).toBe('code_review');

      // 4. getPrompt
      const promptRes = await testClient.mcpServers.getPrompt({
        userId,
        serverId: 'calc_server',
        name: 'code_review',
        args: { diff: 'added feature' },
      });
      expect(promptRes.messages[0].content).toEqual({
        type: 'text',
        text: 'Reviewing: {"diff":"added feature"}',
      });

      // 5. listResources
      const resourcesRes = await testClient.mcpServers.listResources({ userId, serverId: 'calc_server' });
      expect(resourcesRes.resources).toHaveLength(1);
      expect(resourcesRes.resources[0].uri).toBe('file:///workspace/readme.md');

      // 6. readResource
      const readRes = await testClient.mcpServers.readResource({
        userId,
        serverId: 'calc_server',
        uri: 'file:///workspace/readme.md',
      });
      expect(readRes.contents[0].text).toBe('# Sample Readme');

      // 7. listResourceTemplates
      const templatesRes = await testClient.mcpServers.listResourceTemplates({
        userId,
        serverId: 'calc_server',
      });
      expect(templatesRes.resourceTemplates).toHaveLength(1);
      expect(templatesRes.resourceTemplates[0].name).toBe('Workspace File');
    } finally {
      (McpClient.prototype as any).connect = originalConnect;
      (McpClient.prototype as any).listTools = originalListTools;
      (McpClient.prototype as any).callTool = originalCallTool;
      (McpClient.prototype as any).listPrompts = originalListPrompts;
      (McpClient.prototype as any).getPrompt = originalGetPrompt;
      (McpClient.prototype as any).listResources = originalListResources;
      (McpClient.prototype as any).readResource = originalReadResource;
      (McpClient.prototype as any).fetchResourceTemplates = originalFetchTemplates;
    }
  });

  test('throws appropriate error when invoking capability APIs on disabled or missing server', async () => {
    await testClient.mcpServers.create({
      userId,
      serverId: 'disabled_srv',
      name: 'Disabled Server',
      url: 'https://disabled.example.com/sse',
      enabled: false,
    });

    await expect(
      testClient.mcpServers.listTools({ userId, serverId: 'disabled_srv' })
    ).rejects.toThrow('is disabled');

    await expect(
      testClient.mcpServers.listTools({ userId, serverId: 'nonexistent_srv' })
    ).rejects.toThrow('not found');
  });
});


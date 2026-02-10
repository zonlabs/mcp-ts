import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Determine the correct dist directory for different environments
// Local development: dist/ folder next to source
// Vercel serverless: files are in /var/task/ (root of deployment)
function getDistDir(): string {
    const currentDir = import.meta.dirname;
    
    // Check if we're in Vercel's serverless environment
    if (currentDir.includes('/var/task/')) {
        return currentDir; // In Vercel, files are in the same directory
    }
    
    // Local development - check if we're running from source or compiled
    if (import.meta.filename.endsWith(".ts")) {
        return path.join(currentDir, "dist");
    }
    
    return currentDir;
}

const DIST_DIR = getDistDir();

// Documentation index for search functionality
const DOC_INDEX = [
    {
        title: "Getting Started with mcp-ts",
        description: "Introduction to the mcp-ts library, including installation, core concepts, and quick start guide.",
        link: "https://zonlabs.github.io/mcp-ts/",
        keywords: ["intro", "getting started", "overview", "quick start", "installation"]
    },
    {
        title: "Installation Guide",
        description: "Step-by-step installation instructions for @mcp-ts/sdk, including prerequisites and storage backend configuration.",
        link: "https://zonlabs.github.io/mcp-ts/docs/installation",
        keywords: ["install", "npm", "package", "setup", "configuration", "typescript"]
    },
    {
        title: "Storage Backends",
        description: "Detailed guide on Redis, File System, SQLite, and In-Memory storage backends with configuration examples.",
        link: "https://zonlabs.github.io/mcp-ts/docs/storage-backends",
        keywords: ["storage", "redis", "file", "sqlite", "memory", "persistence", "session"]
    },
    {
        title: "React Integration",
        description: "How to use the useMcp hook in React applications, including connection management and tool calling.",
        link: "https://zonlabs.github.io/mcp-ts/docs/react",
        keywords: ["react", "hooks", "usemcp", "frontend", "ui", "connection"]
    },
    {
        title: "Next.js Integration",
        description: "Setup guide for Next.js applications with createNextMcpHandler and App Router support.",
        link: "https://zonlabs.github.io/mcp-ts/docs/nextjs",
        keywords: ["nextjs", "next", "app router", "api routes", "server"]
    },
    {
        title: "Vue Integration",
        description: "Using mcp-ts with Vue 3 and the Composition API for reactive MCP connections.",
        link: "https://zonlabs.github.io/mcp-ts/docs/vue",
        keywords: ["vue", "vue3", "composition api", "frontend"]
    },
    {
        title: "Node.js/Express Setup",
        description: "Server-side setup for Node.js and Express applications with SSE handlers.",
        link: "https://zonlabs.github.io/mcp-ts/docs/node-express",
        keywords: ["node", "express", "server", "sse", "backend"]
    },
    {
        title: "API Reference",
        description: "Complete API documentation for server-side and client-side classes, methods, and types.",
        link: "https://zonlabs.github.io/mcp-ts/docs/api-reference",
        keywords: ["api", "reference", "documentation", "methods", "classes", "types"]
    },
    {
        title: "Adapters",
        description: "Framework adapters for Vercel AI SDK, LangChain, Mastra, and AG-UI protocol integration.",
        link: "https://zonlabs.github.io/mcp-ts/docs/adapters",
        keywords: ["adapters", "ai sdk", "langchain", "mastra", "ag-ui", "frameworks", "integration"]
    },
    {
        title: "MCP Apps (SEP-1865)",
        description: "Building interactive UI components for MCP tools with AppBridge protocol and iframe sandboxing.",
        link: "https://zonlabs.github.io/mcp-ts/docs/mcp-apps",
        keywords: ["mcp apps", "sep-1865", "ui", "iframe", "appbridge", "interactive"]
    },
    {
        title: "MultiSessionClient",
        description: "Managing multiple MCP server connections and aggregating tools from multiple sources.",
        link: "https://zonlabs.github.io/mcp-ts/docs/api-reference#multisessionclient",
        keywords: ["multisession", "multiple servers", "aggregate", "client"]
    },
    {
        title: "MCPClient",
        description: "Direct MCP client class for server-side operations, tool calling, and resource management.",
        link: "https://zonlabs.github.io/mcp-ts/docs/api-reference#mcpclient",
        keywords: ["mcpclient", "client", "server-side", "tools", "resources", "prompts"]
    },
    {
        title: "OAuth 2.1 Authentication",
        description: "Implementing OAuth 2.1 flows for MCP server authentication and authorization.",
        link: "https://zonlabs.github.io/mcp-ts/docs/api-reference#oauth",
        keywords: ["oauth", "auth", "authentication", "authorization", "security"]
    },
    {
        title: "SSE (Server-Sent Events)",
        description: "Understanding SSE for real-time updates, connection management, and heartbeat mechanisms.",
        link: "https://zonlabs.github.io/mcp-ts/docs/api-reference#sse",
        keywords: ["sse", "server-sent events", "real-time", "streaming", "connection"]
    },
    {
        title: "Error Handling",
        description: "Handling UnauthorizedError and other exceptions in MCP client applications.",
        link: "https://zonlabs.github.io/mcp-ts/docs/api-reference#error-handling",
        keywords: ["error", "exception", "handling", "unauthorized", "debugging"]
    }
];

// In-memory feedback storage (in production, use a database)
const feedbackStorage: Array<{
    id: string;
    feedback: string;
    category: string;
    timestamp: number;
}> = [];

// UI resource URIs
const SEARCH_UI_RESOURCE_URI = "ui://docs/search.html";
const FEEDBACK_RESOURCE_URI = "ui://docs/feedback.html";

// Shared search function
function performSearch(query: string): Array<{ title: string; description: string; link: string }> {
    const normalizedQuery = query.toLowerCase();
    
    const results = DOC_INDEX.filter(doc => {
        const inTitle = doc.title.toLowerCase().includes(normalizedQuery);
        const inDescription = doc.description.toLowerCase().includes(normalizedQuery);
        const inKeywords = doc.keywords.some(k => k.toLowerCase().includes(normalizedQuery));
        return inTitle || inDescription || inKeywords;
    });

    return results.map(doc => ({
        title: doc.title,
        description: doc.description,
        link: doc.link
    }));
}

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
    const server = new McpServer({
        name: "mcp-ts Docs Server",
        version: "1.0.0",
    });

    // Register search-docs tool (for LLM - no UI resource)
    registerAppTool(
        server,
        "search-docs",
        {
            title: "Search mcp-ts Documentation",
            description: "Search through mcp-ts documentation to find relevant guides, API references, and examples. Returns JSON results directly without UI.",
            inputSchema: {
                query: z.string().describe("Search query for finding mcp-ts documentation")
            },
            _meta: {}, // Empty _meta for LLM use - no UI resource
        },
        async (args: { query: string }): Promise<CallToolResult> => {
            const formattedResults = performSearch(args.query);

            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        query: args.query,
                        results: formattedResults,
                        count: formattedResults.length
                    }, null, 2)
                }],
            };
        },
    );

    // Register search-docs-ui tool (for User - with UI resource)
    registerAppTool(
        server,
        "search-docs-ui",
        {
            title: "Search mcp-ts Documentation (Interactive)",
            description: "Interactive documentation search with UI. Use this when the user wants to search documentation themselves.",
            inputSchema: {
                query: z.string().optional().describe("Optional initial search query")
            },
            _meta: { ui: { resourceUri: SEARCH_UI_RESOURCE_URI } },
        },
        async (args: { query?: string }): Promise<CallToolResult> => {
            const query = args.query || "";
            const formattedResults = query ? performSearch(query) : [];

            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        query: query,
                        results: formattedResults,
                        count: formattedResults.length,
                        ui: true
                    }, null, 2)
                }],
            };
        },
    );

    // Register the submit-feedback tool
    registerAppTool(
        server,
        "submit-feedback",
        {
            title: "Submit Feedback for mcp-ts",
            description: "Submit feedback, suggestions, or issues related to the mcp-ts library.",
            inputSchema: {
                feedback: z.string().describe("Your feedback, suggestions, or issue description"),
                category: z.enum(["general", "bug", "feature-request", "documentation", "other"]).optional().describe("Category of feedback (optional)")
            },
            _meta: { ui: { resourceUri: FEEDBACK_RESOURCE_URI } },
        },
        async (args: { feedback: string; category?: string }): Promise<CallToolResult> => {
            const id = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store feedback
            feedbackStorage.push({
                id,
                feedback: args.feedback,
                category: args.category || "general",
                timestamp: Date.now()
            });

            console.log(`[Feedback Received] ${id}: ${args.category || "general"} - ${args.feedback.substring(0, 100)}...`);

            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        success: true,
                        message: "Thank you for your feedback! It helps us improve mcp-ts.",
                        feedbackId: id
                    }, null, 2)
                }],
            };
        },
    );

    // Helper function to read HTML file from multiple possible locations
    async function getHtmlContent(): Promise<string> {
        const possiblePaths = [
            path.join(DIST_DIR, "mcp-app.html"),
            path.join(process.cwd(), "dist", "mcp-app.html"),
            path.join(process.cwd(), "mcp-app.html"),
            "/var/task/dist/mcp-app.html",
            "/var/task/mcp-app.html",
        ];
        
        for (const htmlPath of possiblePaths) {
            try {
                return await fs.readFile(htmlPath, "utf-8");
            } catch {
                continue;
            }
        }
        
        throw new Error("Could not find mcp-app.html in any of the expected locations");
    }

    // Register the search UI resource
    registerAppResource(
        server,
        SEARCH_UI_RESOURCE_URI,
        SEARCH_UI_RESOURCE_URI,
        { mimeType: RESOURCE_MIME_TYPE },
        async (): Promise<ReadResourceResult> => {
            const html = await getHtmlContent();
            return {
                contents: [{ uri: SEARCH_UI_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
            };
        },
    );

    // Register the feedback UI resource
    registerAppResource(
        server,
        FEEDBACK_RESOURCE_URI,
        FEEDBACK_RESOURCE_URI,
        { mimeType: RESOURCE_MIME_TYPE },
        async (): Promise<ReadResourceResult> => {
            const html = await getHtmlContent();
            return {
                contents: [{ uri: FEEDBACK_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
            };
        },
    );

    return server;
}


import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";

console.log("Starting MCP App Server...");

const server = new McpServer({
    name: "My MCP App Server",
    version: "1.0.0",
});

// The ui:// scheme tells hosts this is an MCP App resource.
const resourceUri = "ui://get-time/index.html";

// Register the tool that returns the current time
registerAppTool(
    server as any,
    "get-time",
    {
        title: "Get Time",
        description: "Returns the current server time.",
        inputSchema: {},
        _meta: { ui: { resourceUri } },
    },
    async () => {
        const time = new Date().toISOString();
        return {
            content: [{ type: "text", text: time }],
        };
    },
);

// Register the resource that serves the bundled HTML
registerAppResource(
    server as any,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
        // In a real app, you would serve the built HTML file
        // For this example, we'll serve a simple string or file
        const htmlPath = path.join(__dirname, "..", "dist", "index.html");
        let html;
        try {
            html = await fs.readFile(htmlPath, "utf-8");
        } catch (e) {
            console.warn("Could not read index.html, using fallback string.", e);
            html = `<html><body><h1>Fallback UI</h1><p>Server time: <span id='time'></span></p></body></html>`;
        }

        return {
            contents: [
                { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
            ],
        };
    },
);

// Expose the MCP server over HTTP
const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}/mcp`);
});

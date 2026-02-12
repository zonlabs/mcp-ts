/**
 * @file MCP Docs App - Documentation search and feedback UI for mcp-ts library.
 * SIMPLIFIED VERSION - No useApp hook to avoid React commit errors
 */
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./mcp-app.module.css";

// --- Types ---

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// Search result type
interface DocResult {
  title: string;
  description: string;
  link: string;
}

interface SearchResults {
  query: string;
  results: DocResult[];
  count: number;
}

// --- Documentation Data ---

// Documentation index for search
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
    title: "API Reference",
    description: "Complete API documentation for server-side and client-side classes, methods, and types.",
    link: "https://zonlabs.github.io/mcp-ts/docs/api-reference",
    keywords: ["api", "reference", "documentation", "methods", "classes", "types"]
  },
];

function performSearch(query: string): DocResult[] {
  const normalizedQuery = query.toLowerCase();
  return DOC_INDEX.filter(doc => {
    const inTitle = doc.title.toLowerCase().includes(normalizedQuery);
    const inDescription = doc.description.toLowerCase().includes(normalizedQuery);
    const inKeywords = doc.keywords.some(k => k.toLowerCase().includes(normalizedQuery));
    return inTitle || inDescription || inKeywords;
  }).map(doc => ({
    title: doc.title,
    description: doc.description,
    link: doc.link
  }));
}

// --- MCP Bridge Implementation (SEP-1865) ---

class McpBridge {
  private nextId = 1;
  private pendingRequests = new Map<number | string, { resolve: (value: any) => void; reject: (reason: any) => void }>();
  private connected = false;

  constructor() {
    window.addEventListener("message", this.handleMessage);
  }

  private handleMessage = (event: MessageEvent) => {
    const data = event.data as JsonRpcResponse;
    if (data && data.jsonrpc === "2.0") {
      if (data.id !== undefined) {
        // Response to a request
        const request = this.pendingRequests.get(data.id);
        if (request) {
          if (data.error) {
            request.reject(data.error);
          } else {
            request.resolve(data.result);
          }
          this.pendingRequests.delete(data.id);
        }
      }
      // Handle notifications (optional, if we need to listen to server events)
    }
  };

  async connect(): Promise<void> {
    if (this.connected) return;

    // Send initialize request
    try {
      await this.sendRequest("initialize", {
        capabilities: {},
        clientInfo: { name: "mcp-ts-docs", version: "1.0.0" },
        protocolVersion: "2024-11-05" // Use a recent date-based version or check spec
      });
      console.log("MCP Bridge Connected");
      this.connected = true;

      // Notify host that we are initialized
      this.sendNotification("notifications/initialized", {});
    } catch (e) {
      console.error("Failed to connect to MCP Host:", e);
      throw e;
    }
  }

  sendRequest(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      window.parent.postMessage(request, "*");

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 10000);
    });
  }

  sendNotification(method: string, params: any): void {
    const notification = {
      jsonrpc: "2.0",
      method,
      params
    };
    window.parent.postMessage(notification, "*");
  }

  // Renamed to match reference implementation style
  async callServerTool(name: string, args: any): Promise<any> {
    return this.sendRequest("tools/call", {
      name,
      arguments: args
    });
  }
}

// Global bridge instance
const mcpBridge = new McpBridge();

// --- Components ---

// Simple hook to check if we're in an iframe
function useInIframe(): boolean {
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    setInIframe(window.parent !== window);
  }, []);

  return inIframe;
}

function useMcpConnection() {
  const inIframe = useInIframe();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (inIframe) {
      mcpBridge.connect().then(() => setConnected(true)).catch(() => setConnected(false));
    }
  }, [inIframe]);

  return { connected, bridge: mcpBridge };
}


// Simple standalone search UI
function StandaloneSearch({ bridge, connected }: { bridge: McpBridge, connected: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      if (connected) {
        const result = await bridge.callServerTool("search-docs", { query });
        // Result content is usually { content: [{ type: "text", text: "..." }] }
        // Our tool returns a JSON string in the text field.
        if (result && result.content && result.content[0] && result.content[0].text) {
          const parsed = JSON.parse(result.content[0].text);
          setResults(parsed);
        }
      } else {
        // Local fallback
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 300));
        const searchResults = performSearch(query);
        setResults({
          query,
          results: searchResults,
          count: searchResults.length
        });
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }

  }, [query, connected, bridge]);

  return (
    <div>
      <div className={styles.searchBox}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search for topics like 'React hooks', 'storage', 'OAuth'..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className={styles.searchButton}
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {results && (
        <div className={styles.resultsContainer}>
          <p className={styles.resultsInfo}>
            Found {results.count} result{results.count !== 1 ? "s" : ""} for &quot;{results.query}&quot;
          </p>

          {results.results.length > 0 ? (
            <ul className={styles.resultsList}>
              {results.results.map((result, index) => (
                <li key={index} className={styles.resultItem}>
                  <h3 className={styles.resultTitle}>{result.title}</h3>
                  <p className={styles.resultDescription}>{result.description}</p>
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.resultLink}
                  >
                    View Documentation →
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.noResults}>
              <p>No results found. Try searching for:</p>
              <ul className={styles.suggestions}>
                <li>&quot;installation&quot; - Setup instructions</li>
                <li>&quot;react&quot; - React integration</li>
                <li>&quot;storage&quot; - Storage backends</li>
                <li>&quot;adapters&quot; - Framework adapters</li>
                <li>&quot;api&quot; - API reference</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Feedback Form Component
function FeedbackForm({ bridge }: { bridge: McpBridge }) {
  const [feedback, setFeedback] = useState("");
  const [category, setCategory] = useState("general");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setStatus("submitting");
    try {
      const result = await bridge.callServerTool("submit-feedback", { feedback, category });
      if (result && result.content && result.content[0] && result.content[0].text) {
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.success) {
          setStatus("success");
          setMessage(parsed.message);
          setFeedback("");
        } else {
          throw new Error("Feedback submission failed");
        }
      }
    } catch (error) {
      console.error("Feedback submission error:", error);
      setStatus("error");
      setMessage("Failed to submit feedback. Check console for details.");
    }
  };

  if (status === "success") {
    return (
      <div className={styles.feedbackSuccess}>
        <h3>✅ Feedback Sent</h3>
        <p>{message}</p>
        <button
          className={styles.resetButton}
          onClick={() => { setStatus("idle"); setMessage(""); }}
        >
          Send Another
        </button>
      </div>
    );
  }

  return (
    <form className={styles.feedbackForm} onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={styles.selectInput}
        >
          <option value="general">General</option>
          <option value="bug">Bug Report</option>
          <option value="feature-request">Feature Request</option>
          <option value="documentation">Documentation</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="feedback">Your Feedback</label>
        <textarea
          id="feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Tell us what you think..."
          className={styles.textareaInput}
          required
          rows={5}
        />
      </div>

      {status === "error" && <p className={styles.errorMessage}>{message}</p>}

      <button
        type="submit"
        className={styles.submitButton}
        disabled={status === "submitting" || !feedback.trim()}
      >
        {status === "submitting" ? "Sending..." : "Submit Feedback"}
      </button>
    </form>
  );
}

// Simple standalone feedback UI
function StandaloneFeedback() {
  return (
    <div className={styles.feedbackIntro}>
      <p>Feedback submission requires MCP server connection.</p>
      <p>Please use this app through an MCP client that supports AppBridge.</p>
    </div>
  );
}

// Main App Component - Simplified to avoid React commit errors
function DocsApp() {
  const [activeTab, setActiveTab] = useState<"search" | "feedback">("search");
  const inIframe = useInIframe();
  const { connected, bridge } = useMcpConnection();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>mcp-ts Documentation</h1>
        <p className={styles.subtitle}>
          {connected ? "Connected via MCP" : (inIframe ? "Connecting..." : "Standalone Mode")}
        </p>
        <div className={styles.badgeContainer}>
          <a href="https://www.npmjs.com/package/@mcp-ts/sdk" target="_blank" rel="noopener noreferrer">
            <img src="https://img.shields.io/npm/v/@mcp-ts/sdk.svg?style=flat&color=3178c6" alt="npm version" />
          </a>
          <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">
            <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat" alt="MIT License" />
          </a>
          <a href="https://zonlabs.github.io/mcp-ts/" target="_blank" rel="noopener noreferrer">
            <img src="https://img.shields.io/badge/docs-website-brightgreen.svg?style=flat&color=ffc107" alt="Documentation" />
          </a>
        </div>
        {!inIframe && (
          <p style={{ color: '#f59e0b', fontSize: '14px', marginTop: '10px' }}>
            ⚠️ Running in standalone mode (no MCP connection)
          </p>
        )}
      </header>

      <nav className={styles.tabNav}>
        <button
          className={`${styles.tabButton} ${activeTab === "search" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("search")}
        >
          Search Docs
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "feedback" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("feedback")}
        >
          Submit Feedback
        </button>
      </nav>

      {activeTab === "search" && (
        <section className={styles.section}>
          <StandaloneSearch bridge={bridge} connected={connected} />
        </section>
      )}

      {activeTab === "feedback" && (
        <section className={styles.section}>
          {connected ? (
            <FeedbackForm bridge={bridge} />
          ) : (
            <StandaloneFeedback />
          )}
        </section>
      )}
    </main>
  );
}

// Render the app
createRoot(document.getElementById("root")!).render(<DocsApp />);

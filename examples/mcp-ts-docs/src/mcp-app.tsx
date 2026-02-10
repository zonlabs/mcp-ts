/**
 * @file MCP Docs App - Documentation search and feedback UI for mcp-ts library.
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import styles from "./mcp-app.module.css";

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

interface ToolInput {
  arguments?: {
    query?: string;
    feedback?: string;
    category?: string;
  };
  toolName?: string;
}

// Check if running in iframe
const isInIframe = typeof window !== 'undefined' && window.parent !== window;

// Documentation index for client-side search (used in standalone mode)
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

// Standalone UI for when AppBridge is not available
function StandaloneUI() {
  const [activeTab, setActiveTab] = useState<"search" | "feedback">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [localResults, setLocalResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    setTimeout(() => {
      const results = performSearch(searchQuery);
      setLocalResults({
        query: searchQuery,
        results,
        count: results.length
      });
      setIsSearching(false);
    }, 300);
  }, [searchQuery]);
  
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>mcp-ts Documentation</h1>
        <p className={styles.subtitle}>Standalone Mode - Direct Search</p>
        <div className={styles.badgeContainer}>
          <span style={{ color: '#f59e0b', fontSize: '14px' }}>⚠️ Running without MCP connection</span>
        </div>
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
          <div className={styles.searchBox}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button 
              className={styles.searchButton}
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {localResults && (
            <div className={styles.resultsContainer}>
              <p className={styles.resultsInfo}>
                Found {localResults.count} result{localResults.count !== 1 ? "s" : ""} for &quot;{localResults.query}&quot;
              </p>
              
              {localResults.results.length > 0 ? (
                <ul className={styles.resultsList}>
                  {localResults.results.map((result, index) => (
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
                  <p>No results found. Try different keywords.</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "feedback" && (
        <section className={styles.section}>
          <div className={styles.feedbackIntro}>
            <p>Feedback submission requires MCP connection. Please use the full MCP app.</p>
          </div>
        </section>
      )}
    </main>
  );
}

// MCP-connected UI
function McpConnectedUI() {
  const [activeTab, setActiveTab] = useState<"search" | "feedback">("search");
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [initialInput, setInitialInput] = useState<ToolInput | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const { app, error } = useApp({
    appInfo: { name: "mcp-ts Docs App", version: "1.0.0" },
    capabilities: {},
  });

  useEffect(() => {
    if (app && !isInitialized) {
      setIsInitialized(true);
      const context = app.getHostContext();
      setHostContext(context);
      
      // Set up event handlers
      app.ontoolinput = async (input) => {
        console.info("Received tool call input:", input);
        if (input?.arguments?.query || input?.arguments?.feedback) {
          setInitialInput(input as ToolInput);
        }
      };
      
      app.ontoolresult = async (result) => {
        console.info("Received tool call result:", result);
        setToolResult(result);
      };
      
      app.onerror = console.error;
    }
  }, [app, isInitialized]);

  if (error) return <div><strong>ERROR:</strong> {error.message}</div>;
  if (!app) return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <p>Connecting to mcp-ts Docs...</p>
    </div>
  );

  return (
    <DocsAppInner 
      app={app} 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      toolResult={toolResult}
      initialInput={initialInput}
      hostContext={hostContext}
    />
  );
}

interface DocsAppInnerProps {
  app: App;
  activeTab: "search" | "feedback";
  setActiveTab: (tab: "search" | "feedback") => void;
  toolResult: CallToolResult | null;
  initialInput: ToolInput | null;
  hostContext?: McpUiHostContext;
}

function DocsAppInner({ app, activeTab, setActiveTab, toolResult, initialInput, hostContext }: DocsAppInnerProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Feedback state
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  // Handle initial tool input
  useEffect(() => {
    if (initialInput?.arguments?.query) {
      setSearchQuery(initialInput.arguments.query);
      setActiveTab("search");
      setIsSearching(true);
      app.callServerTool({ 
        name: "search-docs-ui", 
        arguments: { query: initialInput.arguments.query } 
      }).catch(() => setIsSearching(false));
    }
  }, [initialInput, app, setActiveTab]);

  // Parse tool results
  useEffect(() => {
    if (toolResult?.content) {
      const text = toolResult.content.find((c) => c.type === "text")?.text;
      if (text) {
        try {
          const data = JSON.parse(text);
          if (data.results !== undefined) {
            setSearchResults(data);
            setIsSearching(false);
          } else if (data.success) {
            setSubmitMessage(data.message);
            setIsSubmitting(false);
            setFeedbackText("");
            setFeedbackCategory("general");
          }
        } catch (e) {
          console.error("Failed to parse tool result:", e);
        }
      }
    }
  }, [toolResult]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    setSearchResults(null);
    
    try {
      const result = await app.callServerTool({ 
        name: "search-docs-ui", 
        arguments: { query: searchQuery } 
      });
      if (result?.content) {
        const textContent = result.content.find((c) => c.type === "text");
        if (textContent && "text" in textContent) {
          const data = JSON.parse(textContent.text);
          if (data.results !== undefined) {
            setSearchResults(data);
            setIsSearching(false);
          }
        }
      }
    } catch (e) {
      console.error("Search error:", e);
      setIsSearching(false);
    }
  }, [app, searchQuery, isSearching]);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitMessage(null);
    
    try {
      const result = await app.callServerTool({ 
        name: "submit-feedback", 
        arguments: { feedback: feedbackText, category: feedbackCategory }
      });
      if (result?.content) {
        const textContent = result.content.find((c) => c.type === "text");
        if (textContent && "text" in textContent) {
          const data = JSON.parse(textContent.text);
          if (data.success) {
            setSubmitMessage(data.message);
            setIsSubmitting(false);
            setFeedbackText("");
            setFeedbackCategory("general");
          }
        }
      }
    } catch (e) {
      console.error("Feedback error:", e);
      setIsSubmitting(false);
    }
  }, [app, feedbackText, feedbackCategory, isSubmitting]);

  return (
    <main
      className={styles.main}
      style={{
        paddingTop: hostContext?.safeAreaInsets?.top,
        paddingRight: hostContext?.safeAreaInsets?.right,
        paddingBottom: hostContext?.safeAreaInsets?.bottom,
        paddingLeft: hostContext?.safeAreaInsets?.left,
      }}
    >
      <header className={styles.header}>
        <h1 className={styles.title}>mcp-ts Documentation</h1>
        <p className={styles.subtitle}>Search guides, API docs, and examples</p>
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
          <div className={styles.searchBox}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search for topics like 'React hooks', 'storage', 'OAuth'..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button 
              className={styles.searchButton}
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {searchResults && (
            <div className={styles.resultsContainer}>
              <p className={styles.resultsInfo}>
                Found {searchResults.count} result{searchResults.count !== 1 ? "s" : ""} for &quot;{searchResults.query}&quot;
              </p>
              
              {searchResults.results.length > 0 ? (
                <ul className={styles.resultsList}>
                  {searchResults.results.map((result, index) => (
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
        </section>
      )}

      {activeTab === "feedback" && (
        <section className={styles.section}>
          <div className={styles.feedbackIntro}>
            <p>Help us improve mcp-ts! Your feedback is valuable for making the library better.</p>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="category">Category (optional)</label>
            <select
              id="category"
              className={styles.select}
              value={feedbackCategory}
              onChange={(e) => setFeedbackCategory(e.target.value)}
            >
              <option value="general">General Feedback</option>
              <option value="bug">Bug Report</option>
              <option value="feature-request">Feature Request</option>
              <option value="documentation">Documentation Issue</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="feedback">Your Feedback</label>
            <textarea
              id="feedback"
              className={styles.textarea}
              placeholder="Describe your experience, issues, or suggestions..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={5}
            />
          </div>

          <button
            className={styles.submitButton}
            onClick={handleSubmitFeedback}
            disabled={isSubmitting || !feedbackText.trim()}
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>

          {submitMessage && (
            <div className={styles.successMessage}>
              {submitMessage}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// Root component that decides which UI to render
function DocsApp() {
  // Use memo to prevent recalculation on re-renders
  const shouldUseStandalone = useMemo(() => !isInIframe, []);
  
  if (shouldUseStandalone) {
    return <StandaloneUI />;
  }
  
  return <McpConnectedUI />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);

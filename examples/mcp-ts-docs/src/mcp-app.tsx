/**
 * @file MCP Docs App - Documentation search and feedback UI for mcp-ts library.
 * SIMPLIFIED VERSION - No useApp hook to avoid React commit errors
 */
import { useCallback, useEffect, useState } from "react";
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

// Simple hook to check if we're in an iframe
function useInIframe(): boolean {
  const [inIframe, setInIframe] = useState(false);
  
  useEffect(() => {
    setInIframe(window.parent !== window);
  }, []);
  
  return inIframe;
}

// Simple standalone search UI
function StandaloneSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setIsSearching(true);
    
    // Simulate network delay
    setTimeout(() => {
      const searchResults = performSearch(query);
      setResults({
        query,
        results: searchResults,
        count: searchResults.length
      });
      setIsSearching(false);
    }, 300);
  }, [query]);

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

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>mcp-ts Documentation</h1>
        <p className={styles.subtitle}>
          {inIframe ? "Connected via MCP" : "Standalone Mode"}
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
          <StandaloneSearch />
        </section>
      )}

      {activeTab === "feedback" && (
        <section className={styles.section}>
          <StandaloneFeedback />
        </section>
      )}
    </main>
  );
}

// Render the app
createRoot(document.getElementById("root")!).render(<DocsApp />);

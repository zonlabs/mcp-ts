import { useState } from 'react';
import type { ToolInfo } from '@mcp-assistant/mcp-redis/shared';

interface ToolListProps {
  tools: ToolInfo[];
  sessionId: string;
  onCallTool: (sessionId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export default function ToolList({ tools, sessionId, onCallTool }: ToolListProps) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [calling, setCalling] = useState<string | null>(null);
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, unknown>>({});

  const handleCallTool = async (toolName: string) => {
    setCalling(toolName);
    try {
      const args = toolArgs[toolName] ? JSON.parse(toolArgs[toolName]) : {};
      const result = await onCallTool(sessionId, toolName, args);
      setResults((prev) => ({ ...prev, [toolName]: result }));
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [toolName]: { error: error instanceof Error ? error.message : 'Unknown error' },
      }));
    } finally {
      setCalling(null);
    }
  };

  return (
    <div className="tool-list">
      {tools.map((tool) => (
        <div key={tool.name} className="tool-item">
          <div className="tool-header" onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}>
            <span className="tool-name">{tool.name}</span>
            <span className="tool-toggle">{expandedTool === tool.name ? '−' : '+'}</span>
          </div>

          {expandedTool === tool.name && (
            <div className="tool-details">
              {tool.description && (
                <p className="tool-description">{tool.description}</p>
              )}

              {tool.inputSchema && (
                <div className="tool-schema">
                  <h5>Input Schema:</h5>
                  <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                </div>
              )}

              <div className="tool-call">
                <h5>Call Tool:</h5>
                <textarea
                  placeholder='{"arg1": "value1", "arg2": "value2"}'
                  value={toolArgs[tool.name] || ''}
                  onChange={(e) =>
                    setToolArgs((prev) => ({ ...prev, [tool.name]: e.target.value }))
                  }
                  rows={3}
                />
                <button
                  onClick={() => handleCallTool(tool.name)}
                  disabled={calling === tool.name}
                >
                  {calling === tool.name ? 'Calling...' : 'Call Tool'}
                </button>
              </div>

              {results[tool.name] && (
                <div className="tool-result">
                  <h5>Result:</h5>
                  <pre>{JSON.stringify(results[tool.name], null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import styles from '../McpDashboard.module.css';

interface ToolExecutorProps {
    selectedTool: {
        sessionId: string;
        toolName: string;
    } | null;
    onClose: () => void;
    onExecute: (sessionId: string, toolName: string, toolArgs: string) => Promise<any>;
    isExecuting: boolean;
    toolResult: any;
}

export default function ToolExecutor({
    selectedTool,
    onClose,
    onExecute,
    isExecuting,
    toolResult: externalToolResult,
}: ToolExecutorProps) {
    const [toolArgs, setToolArgs] = useState('{}');
    // Local state for toolResult so we can clear it when tool changes, 
    // though parent might control it. The parent passes toolResult, so we should probably rely on that
    // or handle the clearing there. For now, let's use the prop.

    // Reset args when tool changes
    useEffect(() => {
        if (selectedTool) {
            setToolArgs('{}');
        }
    }, [selectedTool]);

    if (!selectedTool) return null;

    const handleExecute = () => {
        onExecute(selectedTool.sessionId, selectedTool.toolName, toolArgs);
    };

    return (
        <>
            <div className={styles.modal}>
                <h3>Execute Tool: {selectedTool.toolName}</h3>

                <div className={styles.modalContent}>
                    <label className={styles.modalLabel}>
                        Tool Arguments (JSON):
                    </label>
                    <textarea
                        value={toolArgs}
                        onChange={(e) => setToolArgs(e.target.value)}
                        placeholder='{"arg1": "value1", "arg2": "value2"}'
                        className={styles.modalTextarea}
                    />
                </div>

                {externalToolResult && (
                    <div className={`${styles.modalResult} ${externalToolResult.error ? styles.error : styles.success}`}>
                        <h4>Result:</h4>
                        <pre>{JSON.stringify(externalToolResult, null, 2)}</pre>
                    </div>
                )}

                <div className={styles.modalActions}>
                    <button
                        onClick={onClose}
                        className={styles.buttonSecondary}
                    >
                        Close
                    </button>
                    <button
                        onClick={handleExecute}
                        disabled={isExecuting}
                        className={styles.button}
                    >
                        {isExecuting ? 'Executing...' : 'Run Tool'}
                    </button>
                </div>
            </div>

            <div
                onClick={onClose}
                className={styles.overlay}
            />
        </>
    );
}

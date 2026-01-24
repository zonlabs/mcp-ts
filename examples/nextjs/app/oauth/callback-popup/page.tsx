'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PopupCallbackPage() {
    const searchParams = useSearchParams();
    const code = searchParams.get('code');
    const [status, setStatus] = useState('Processing authentication...');

    useEffect(() => {
        if (code) {
            if (window.opener) {
                try {
                    // Send the code back to the main window
                    window.opener.postMessage(
                        { type: 'MCP_AUTH_CODE', code },
                        window.location.origin
                    );
                    setStatus('Authentication successful! Closing window...');
                    // Close the popup after a brief delay
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                } catch (err) {
                    console.error('Failed to communicate with opener:', err);
                    setStatus('Error: Could not communicate with main window.');
                }
            } else {
                setStatus('Error: No opener window found. Please indicate this window was opened by the dashboard.');
            }
        } else {
            setStatus('Error: No authorization code received.');
        }
    }, [code]);

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            fontFamily: 'system-ui, sans-serif',
            flexDirection: 'column',
            gap: '1rem',
            backgroundColor: '#f5f5f5',
            color: '#333'
        }}>
            <div style={{
                padding: '2rem',
                borderRadius: '8px',
                backgroundColor: 'white',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                textAlign: 'center'
            }}>
                <h2>MCP Authentication</h2>
                <p>{status}</p>
            </div>
        </div>
    );
}

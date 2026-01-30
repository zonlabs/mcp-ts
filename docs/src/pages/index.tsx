import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import { Terminal, AnimatedSpan, TypingAnimation } from '../components/Terminal';
import { Boxes } from '../components/BackgroundBoxes';

import styles from './index.module.css';

const InstallationExample = () => (
  <Terminal>
    <AnimatedSpan delay={0} className={styles.command}>npm install @mcp-ts/sdk</AnimatedSpan>
    <TypingAnimation delay={1000} duration={50}>
      Installing dependencies...
    </TypingAnimation>
    <AnimatedSpan delay={2500} className={styles.success}>✓ Package installed successfully</AnimatedSpan>
    <AnimatedSpan delay={3000} className={styles.command}>node server.js</AnimatedSpan>
    <TypingAnimation delay={4000} duration={40}>
      Starting MCP server...
    </TypingAnimation>
    <AnimatedSpan delay={5500} className={styles.success}>🚀 Server ready at http://localhost:3000</AnimatedSpan>
  </Terminal>
);

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className={styles.boxesWrapper}>
        <Boxes />
      </div>
      <div className={styles.maskOverlay} />
      <div className="container" style={{ position: 'relative', zIndex: 20 }}>
        <div className="row">
          <div className={clsx('col col--6', styles.heroText)}>
            <div className={styles.logoTitle}>
              <img src="/mcp-ts/img/logo.svg" alt="mcp-ts logo" width="60" height="60" />
              <Heading as="h1" className="hero__title">
                {siteConfig.title}
              </Heading>
            </div>
            <p className="hero__subtitle">{siteConfig.tagline}</p>
            <div className={styles.buttons}>
              <Link
                className={clsx('button button--secondary button--lg', styles.heroButton)}
                to="/docs/">
                Get Started
              </Link>
              <Link
                className={clsx('button button--outline button--secondary button--lg', styles.heroButton, styles.heroButtonOutline)}
                to="/docs/api-reference">
                API Reference
              </Link>
            </div>
          </div>
          <div className={clsx('col col--6', styles.heroTerminal)}>
            <InstallationExample />
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Lightweight MCP client library for JavaScript applications with Redis sessions and SSE support">
      <HomepageHeader />
      <main>
        <div className="container" style={{ marginTop: '4rem', marginBottom: '4rem' }}>
          <div className="row">
            <div className="col col--8 col--offset-2">
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <Heading as="h2">See it in Action</Heading>
                <div style={{ fontSize: '1.2rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  Demonstration of interaction between remote MCP servers and the
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <img src="/mcp-ts/img/framework/vercel.svg" alt="Vercel" width="16" height="16" /> AI SDK.
                  </span>
                </div>
              </div>
              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                <video
                  src="/mcp-ts/vid/mcp-ts.mp4"
                  width="100%"
                  controls
                  autoPlay
                  muted
                  loop
                  style={{ display: 'block' }}
                />
              </div>

              <div style={{ textAlign: 'center', marginBottom: '2rem', marginTop: '4rem' }}>
                <Heading as="h2">AG-UI Middleware</Heading>
                <div style={{ fontSize: '1.2rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  Powering <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <img src="/mcp-ts/img/agent-framework/langchain.svg" alt="LangChain" width="20" height="20" /> LangChain
                  </span> (create_agent) +
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <img src="/mcp-ts/img/agent-framework/agui.webp" alt="AG-UI" width="20" height="20" /> AG-UI
                  </span> + CopilotKit
                </div>
              </div>
              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                <video
                  src="/mcp-ts/vid/langchain-agui.mp4"
                  width="100%"
                  controls
                  muted
                  loop
                  style={{ display: 'block' }}
                />
              </div>
            </div>
          </div>
        </div>
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              <div className="col col--12">
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <Heading as="h2" style={{ marginBottom: '1.5rem' }}>
                    Why mcp-ts?
                  </Heading>
                  <p style={{ fontSize: '1.2rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8' }}>
                    A lightweight, TypeScript-first MCP client for React and serverless apps.
                    Features Redis-backed sessions and real-time updates via SSE.
                  </p>
                </div>
              </div>
            </div>
            <div className="row" style={{ marginTop: '2rem' }}>
              <div className="col col--6">
                <Heading as="h3">Server-Side</Heading>
                <p>
                  Build robust MCP connections with stateless session management
                  and SSE endpoints for real-time updates.
                </p>
                <CodeBlock language="typescript">
                  {`import { MCPClient } from '@mcp-ts/sdk/server';

const client = new MCPClient({
  serverUrl: 'https://mcp.example.com',
  identity: 'user-123'
});

await client.connect();`}
                </CodeBlock>
              </div>
              <div className="col col--6">
                <Heading as="h3">Client-Side</Heading>
                <p>
                  Seamlessly integrate MCP connections into your React applications
                  with the useMcp hook and automatic state synchronization.
                </p>
                <CodeBlock language="tsx">
                  {`import { useMcp } from '@mcp-ts/sdk/client';

function MyComponent() {
  const { connections, connect } = useMcp({
    url: '/api/mcp/sse',
    identity: 'user-123'
  });

  return <div>...</div>;
}`}
                </CodeBlock>
              </div>
            </div>
          </div>
        </section>
        <section style={{ padding: '4rem 0', backgroundColor: 'var(--ifm-background-surface-color)' }}>
          <div className="container">
            <div className="row">
              <div className="col col--8 col--offset-2">
                <Heading as="h2" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  Frequently Asked Questions
                </Heading>

                <div style={{ marginBottom: '2rem' }}>
                  <Heading as="h3">What is mcp-ts and what is it for?</Heading>
                  <p>
                    <code>mcp-ts</code> acts as a secure bridge between your AI application (like a Vercel AI SDK chatbot)
                    and Model Context Protocol (MCP) servers. It manages connections, handles complex authentication (OAuth),
                    and persists session state using Storage Backends e.g. Redis, allowing your AI agents to use tools from external services reliably.
                  </p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <Heading as="h3">Why Server-Sent Events (SSE) instead of WebSockets?</Heading>
                  <p>
                    SSE is unidirectional and stateless, making it ideal for serverless environments (like Vercel/Next.js)
                    where maintaining long-lived WebSocket connections is difficult, expensive, or subject to timeout limits.
                  </p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <Heading as="h3">Can I use this without Redis?</Heading>
                  <p>
                    Yes! We support <strong>In-Memory</strong> and <strong>File System</strong> storage for local development.
                    However, for production in serverless environments, Redis is required to persist connection state across lambda invocations.
                  </p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <Heading as="h3">Is this compatible with the Vercel AI SDK?</Heading>
                  <p>
                    Absolutely. <code>mcp-ts</code> is designed to plug directly into the AI SDK's <code>streamText</code> and
                    <code>generateText</code> functions, allowing LLMs to use MCP tools seamlessly.
                  </p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <Heading as="h3">How is authentication handled?</Heading>
                  <p>
                    The library includes detailed OAuth flows, handling token exchange and refresh automatically,
                    so you can connect to secure MCP servers support (like Neon, Github, etc.) out of the box.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

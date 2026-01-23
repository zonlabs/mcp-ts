import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import { Terminal, AnimatedSpan, TypingAnimation } from '../components/Terminal';
import { Boxes } from '../components/BackgroundBoxes';

import styles from './index.module.css';

const InstallationExample = () => (
  <Terminal>
    <AnimatedSpan delay={0} className={styles.command}>npm install @mcp-ts/redis</AnimatedSpan>
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
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              <div className="col col--12">
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <Heading as="h2" style={{ marginBottom: '1.5rem' }}>
                    Why mcp-ts?
                  </Heading>
                  <p style={{ fontSize: '1.2rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.8' }}>
                    A modern, TypeScript-first MCP client library with Redis-backed session management
                    and real-time Server-Sent Events (SSE) support. Designed for serverless environments
                    and React applications.
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
                <pre style={{ backgroundColor: 'var(--ifm-code-background)', padding: '1rem', borderRadius: '8px' }}>
                  {`import { MCPClient } from '@mcp-ts/redis/server';

const client = new MCPClient({
  serverUrl: 'https://mcp.example.com',
  userId: 'user-123'
});

await client.connect();`}
                </pre>
              </div>
              <div className="col col--6">
                <Heading as="h3">Client-Side</Heading>
                <p>
                  Seamlessly integrate MCP connections into your React applications
                  with the useMcp hook and automatic state synchronization.
                </p>
                <pre style={{ backgroundColor: 'var(--ifm-code-background)', padding: '1rem', borderRadius: '8px' }}>
                  {`import { useMcp } from '@mcp-ts/redis/client';

function MyComponent() {
  const { connections, connect } = useMcp({
    url: '/api/mcp/sse',
    userId: 'user-123'
  });

  return <div>...</div>;
}`}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

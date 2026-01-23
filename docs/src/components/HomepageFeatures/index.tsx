import type { ReactNode } from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Real-Time SSE',
    description: (
      <>
        Built-in Server-Sent Events (SSE) support for real-time connection updates without the complexity of WebSockets.
      </>
    ),
  },
  {
    title: 'Redis Sessions',
    description: (
      <>
        Redis-backed session management for stateless and scalable MCP connections with automatic TTL.
      </>
    ),
  },
  {
    title: 'Serverless Ready',
    description: (
      <>
        Designed for serverless environments like Vercel and AWS Lambda, with a dedicated client-side React hook.
      </>
    ),
  },
];

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4', 'featureCol')}>
      <div className="featureCard text--center">
        <Heading as="h3" style={{ marginBottom: '1rem' }}>{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'mcp-ts',
  tagline: 'Lightweight MCP client library for JavaScript applications',
  favicon: 'img/favicon-mcp-ts.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  markdown: {
    mermaid: true,
  },

  // Set the production url of your site here
  url: 'https://zonlabs.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/mcp-ts/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'zonlabs', // Usually your GitHub org/user name.
  projectName: 'mcp-ts', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl:
            'https://github.com/zonlabs/mcp-ts/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve("@easyops-cn/docusaurus-search-local"),
      /** @type {import("@easyops-cn/docusaurus-search-local").PluginOptions} */
      ({
        hashed: true,
      }),
    ],
  ],

  themeConfig: {
    // Social card for sharing
    image: 'img/logo.svg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'mcp-ts',
      logo: {
        alt: 'mcp-ts Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          label: 'v1.0.1',
          position: 'right',
          href: 'https://www.npmjs.com/package/@mcp-ts/sdk',
          className: 'navbar-version-badge',
        },
        {
          href: 'https://www.npmjs.com/package/@mcp-ts/sdk',
          position: 'right',
          className: 'header-npm-link',
          'aria-label': 'NPM Package',
        },
        {
          href: 'https://github.com/zonlabs/mcp-ts',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub Repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/',
            },
            {
              label: 'API Reference',
              to: '/docs/api-reference',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/zonlabs/mcp-ts/discussions',
            },
            {
              label: 'Report an Issue',
              href: 'https://github.com/zonlabs/mcp-ts/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              html: `
                <a href="https://github.com/zonlabs/mcp-ts" target="_blank" rel="noreferrer noopener" aria-label="GitHub" class="footer__link-item">
                  <span class="footer__icon-wrapper">
                    <svg height="24" width="24" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
                      <path fill="currentColor" fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                    <span style="margin-left: 8px;">GitHub</span>
                  </span>
                </a>
              `,
            },
            {
              html: `
                <a href="https://www.npmjs.com/package/@mcp-ts/sdk" target="_blank" rel="noreferrer noopener" aria-label="NPM" class="footer__link-item" style="margin-top: 8px; display: block;">
                  <span class="footer__icon-wrapper">
                    <svg height="24" width="24" viewBox="0 0 24 24" version="1.1" aria-hidden="true">
                       <path fill="currentColor" d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zM6.666 14H2.666V9.999h4V14zm4 0H9.332V9.999h1.334V14zm5.332 0h-1.335V9.999h1.335V14zm1.336 0h-1.336v-2.668H14.664V9.999h2.669V14zm5.334 0h-4.002V9.999h4.002V14zM20 9.999h1.334V14H20V9.999z"/>
                    </svg>
                    <span style="margin-left: 8px;">NPM</span>
                  </span>
                </a>
              `,
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MCP Assistant.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

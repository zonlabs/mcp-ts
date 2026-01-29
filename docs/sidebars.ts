import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [
    'intro',
    'installation',
    'storage-backends',
    {
      type: 'category',
      label: 'Frameworks',
      collapsed: false,
      items: [
        {
          type: 'doc',
          id: 'nextjs',
          className: 'sidebar-nextjs-link',
        },
        {
          type: 'doc',
          id: 'node-express',
          label: 'Express.js',
          className: 'sidebar-express-link',
        },
        {
          type: 'doc',
          id: 'react',
          className: 'sidebar-react-link',
        },
        {
          type: 'doc',
          id: 'vue',
          className: 'sidebar-vue-link',
        },
      ],
    },
    'adapters',
    'api-reference',
  ],

  // But you can create a sidebar manually
  /*
  tutorialSidebar: [
    'intro',
    'hello',
    {
      type: 'category',
      label: 'Tutorial',
      items: ['tutorial-basics/create-a-document'],
    },
  ],
   */
};

export default sidebars;

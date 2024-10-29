// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

const { parseEnv } = require('./src/utils/env');
const { generateTypedocDocusaurusPlugins } = require('./docusaurus.typedoc.js');

const env = parseEnv(process.env);

const poweredByVercel = `
  <div style="padding-top: 24px;">
    <a
      href="https://vercel.com/?utm_source=trpc&utm_campaign=oss"
      target="_blank"
      rel="noreferrer"
    >
      <img
        src="/img/powered-by-vercel.svg"
        alt="Powered by Vercel"
        style="height: 40px;display:inline-block;box-shadow: 0px 0px 32px rgba(255, 255, 255, 0.2);"
      />
    </a>
  </div>
`.trim();

/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'tRPC',
  tagline: 'Move Fast and Break Nothing.\nEnd-to-end typesafe APIs made easy.',
  url: 'https://trpc.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  onDuplicateRoutes: 'throw',
  favicon: 'img/favicon.ico',
  organizationName: 'trpc', // Usually your GitHub org/user name.
  projectName: 'trpc', // Usually your repo name.
  themeConfig: {
    disableSwitch: false,
    respectPrefersColorScheme: true,
    image: `${env.OG_URL}/api/landing?cache-buster=${new Date().getDate()}`,
    algolia: {
      appId: 'BTGPSR4MOE',
      apiKey: 'ed8b3896f8e3e2b421e4c38834b915a8',
      indexName: 'trpc',
      // contextualSearch: true,
      // searchParameters: {},
    },
    // announcementBar: {
    //   id: 'actions',
    //   content:
    //     "🚀 New blog post live! Check out how to use Server Actions with tRPC <a href='/blog/trpc-actions'><strong>here</strong></a>.",
    //   backgroundColor: 'var(--ifm-color-primary-dark)',
    //   textColor: '#ffffff',
    //   isCloseable: true,
    // },
    navbar: {
      title: 'tRPC',
      logo: {
        alt: 'tRPC logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          to: 'docs',
          label: 'Docs',
          activeBaseRegex: 'docs(/?)$',
        },
        {
          to: 'docs/quickstart',
          label: 'Quickstart',
        },
        {
          to: 'docs/community/awesome-trpc',
          label: 'Awesome tRPC Collection',
        },
        {
          to: 'docs/client/nextjs',
          label: 'Using Next.js',
        },
        {
          href: 'https://github.com/trpc/trpc',
          position: 'right',
          className: 'header-social-link header-github-link',
          'aria-label': 'GitHub',
        },
        {
          href: 'https://twitter.com/trpcio',
          position: 'right',
          className: 'header-social-link header-twitter-link',
          'aria-label': 'Twitter',
        },
        {
          href: 'https://trpc.io/discord',
          position: 'right',
          className: 'header-social-link header-discord-link',
          'aria-label': 'Discord',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
          dropdownActiveClassDisabled: true,
        },
      ],
    },
    footer: {
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Docs',
              to: 'docs',
            },
            {
              label: 'Usage with Next.js',
              to: 'docs/client/nextjs',
            },
            {
              label: 'FAQ / Troubleshooting',
              to: 'docs/faq',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/trpc/trpc/tree/next',
              className: 'flex items-center',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/alexdotjs',
              className: 'flex items-center',
            },
            {
              label: 'Discord',
              href: 'https://trpc.io/discord',
              className: 'flex items-center',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: 'blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/trpc/trpc/tree/next',
              className: 'flex items-center',
            },
            {
              label: '❤️ Sponsor tRPC',
              href: 'https://trpc.io/sponsor',
              className: 'flex items-center',
            },
          ],
        },
      ],
      copyright: poweredByVercel,
    },
  },
  plugins: [
    // Sidebar order is decided by the position in the array below
    ...(env.TYPEDOC
      ? generateTypedocDocusaurusPlugins([
          'server',
          'client',
          'react-query',
          'next',
        ])
      : []),
    async function myPlugin() {
      return {
        name: 'docusaurus-tailwindcss',
        configurePostCss(postcssOptions) {
          // Appends TailwindCSS, AutoPrefixer & CSSNano.
          /* eslint-disable @typescript-eslint/no-var-requires */
          postcssOptions.plugins.push(require('tailwindcss'));
          postcssOptions.plugins.push(require('autoprefixer'));
          if (process.env.NODE_ENV === 'production') {
            postcssOptions.plugins.push(require('cssnano'));
          }
          /* eslint-enable @typescript-eslint/no-var-requires */
          return postcssOptions;
        },
      };
    },
  ],
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          lastVersion: 'current',
          // disableVersioning: true,
          // onlyIncludeVersions: ['9.x'],
          versions: {
            current: {
              label: '11.x',
              // path: 'v10',
              badge: true,
              // className: 'v11',
              banner: 'unreleased',
            },
            '10.x': {
              label: '10.x',
              path: 'v10',
              badge: true,
              // className: 'v10',
              banner: 'none',
            },
            '9.x': {
              label: '9.x',
              path: 'v9',
              badge: true,
              // className: 'v9',
              banner: 'unmaintained',
            },
          },
          // includeCurrentVersion: false,
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/trpc/trpc/tree/next/www/',
          remarkPlugins: [
            [
              require('remark-shiki-twoslash').default,
              require('./shikiTwoslash.config'),
            ],
            require('./mdxToJsx'), // Transforms HTML nodes output by shiki-twoslash into JSX nodes
          ],
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl: 'https://github.com/trpc/trpc/tree/next/www/',
          remarkPlugins: [
            [
              require('remark-shiki-twoslash').default,
              require('./shikiTwoslash.config'),
            ],
            require('./mdxToJsx'), // Transforms HTML nodes output by shiki-twoslash into JSX nodes
          ],
        },
        theme: {
          customCss: ['./src/css/custom.css'],
        },
        gtag: {
          trackingID: 'G-7KLX2VFLVR',
        },
      },
    ],
  ],
  scripts: [
    {
      async: true,
      src: 'https://platform.twitter.com/widgets.js',
      charSet: 'utf-8',
    },
  ],
  clientModules: [
    require.resolve('./docusaurus.twitterReload.js'),
    require.resolve('./docusaurus.preferredTheme.js'),
  ],

  customFields: {
    env,
  },
};

module.exports = {
  title: 'tRPC',
  tagline: 'End-to-end typesafe APIs made easy',
  url: 'https://trpc.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'trpc', // Usually your GitHub org/user name.
  projectName: 'trpc', // Usually your repo name.
  themeConfig: {
    image: 'img/facebook_cover_photo_2.png',
    prism: {
      theme: require('prism-react-renderer/themes/vsDark'),
    },
    algolia: {
      appId: 'BTGPSR4MOE',
      apiKey: '21afcd19f62cce875a67753d48f7e216',
      indexName: 'trpc',
      // contextualSearch: true,
      // searchParameters: {},
    },
    navbar: {
      title: 'tRPC',
      logo: {
        alt: 'tRPC logo',
        src: 'img/logo-no-text.svg',
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
          to: 'docs/awesome-trpc',
          label: 'Awesome tRPC Collection',
        },
        {
          to: 'docs/nextjs',
          label: 'Usage with Next.js',
        },
        {
          href: 'https://github.com/trpc/trpc',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://twitter.com/alexdotjs',
          label: 'Twitter',
          position: 'right',
        },
        {
          href: 'https://trpc.io/discord',
          label: 'Discord',
          position: 'right',
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
              label: 'Docs',
              to: 'docs',
            },
            {
              label: 'Usage with Next.js',
              to: 'docs/nextjs',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/trpc/trpc',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/alexdotjs',
            },
            {
              label: 'Discord',
              href: 'https://trpc.io/discord',
            },
          ],
        },
        {
          title: 'More',
          items: [
            // {
            //   label: 'Blog',
            //   to: 'blog',
            // },
            {
              label: 'GitHub',
              href: 'https://github.com/trpc/trpc',
            },
          ],
        },
      ],
      // copyright: `Copyright © ${new Date().getFullYear()} My Project, Inc. Built with Docusaurus.`,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/trpc/trpc/tree/main/www/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl: 'https://github.com/trpc/trpc/tree/main/www/blog/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        googleAnalytics: {
          trackingID: 'UA-198119985-2',
          // Optional fields.
          anonymizeIP: true, // Should IPs be anonymized?
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
  clientModules: [require.resolve('./docusaurus.twitter-reload.js')],
};

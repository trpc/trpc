module.exports = {
  title: 'tRPC',
  tagline: 'TypeScript toolkit for building end-to-end type-safe APIs',
  url: 'https://trpc.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'trpc', // Usually your GitHub org/user name.
  projectName: 'trpc', // Usually your repo name.
  themeConfig: {
    sidebarCollapsible: false,
    image: 'img/facebook_cover_photo_2.png',
    prism: {
      theme: require('prism-react-renderer/themes/vsDark'),
    },
    googleAnalytics: {
      trackingID: 'G-84E8JZWNQ3',
      // Optional fields.
      anonymizeIP: true, // Should IPs be anonymized?
    },
    navbar: {
      title: 'tRPC',
      logo: {
        alt: 'tRPC logo',
        src: 'img/logo-no-text.png',
      },
      items: [
        {
          to: 'docs/',
          activeBasePath: 'docs',
          label: 'Docs',
          position: 'left',
        },
        {
          to: 'docs/quickstart',
          activeBasePath: 'docs/quickstart',
          label: 'Quickstart',
          position: 'left',
        },
        {
          to: 'docs/nextjs',
          activeBasePath: 'docs/nextjs',
          label: 'Usage with Next.js',
          position: 'left',
        },
        {
          href: 'https://github.com/trpc/trpc',
          label: 'GitHub',
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
      },
    ],
  ],
};

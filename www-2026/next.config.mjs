import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: 'assets.trpc.io' },
      { hostname: 'avatars.githubusercontent.com' },
      { hostname: 'github.com' },
    ],
  },
  // Redirect old v11 paths to current paths
  async redirects() {
    return [
      // Docs root redirects to introduction
      {
        source: '/docs',
        destination: '/docs/introduction',
        permanent: false,
      },
      // External redirects
      {
        source: '/discord',
        destination: 'https://discord.gg/SYEGezwMGg',
        permanent: true,
      },
      {
        source: '/sponsor',
        destination: 'https://github.com/sponsors/KATT',
        permanent: true,
      },
      // Old docs path redirects (from vercel.json)
      {
        source: '/docs/v11/:path*',
        destination: '/docs/:path*',
        permanent: true,
      },
      {
        source: '/docs/reactjs/:path*',
        destination: '/docs/client/react/:path*',
        permanent: true,
      },
      {
        source: '/docs/nextjs/:path*',
        destination: '/docs/client/nextjs/:path*',
        permanent: true,
      },
      {
        source: '/docs/links/:path*',
        destination: '/docs/client/links/:path*',
        permanent: true,
      },
      {
        source: '/docs/react/:path*',
        destination: '/docs/client/react/:path*',
        permanent: true,
      },
      {
        source: '/docs/vanilla/:path*',
        destination: '/docs/client/vanilla/:path*',
        permanent: true,
      },
      {
        source: '/docs/useContext',
        destination: '/docs/client/react/useUtils',
        permanent: true,
      },
      {
        source: '/docs/ssg',
        destination: '/docs/client/nextjs/ssg',
        permanent: true,
      },
      {
        source: '/docs/ssr',
        destination: '/docs/client/nextjs/ssr',
        permanent: true,
      },
      {
        source: '/docs/data-transformers',
        destination: '/docs/server/data-transformers',
        permanent: true,
      },
      {
        source: '/docs/error-handling',
        destination: '/docs/server/error-handling',
        permanent: true,
      },
      {
        source: '/docs/error-formatting',
        destination: '/docs/server/error-formatting',
        permanent: true,
      },
      {
        source: '/docs/caching',
        destination: '/docs/server/caching',
        permanent: true,
      },
      {
        source: '/docs/middlewares',
        destination: '/docs/server/middlewares',
        permanent: true,
      },
      {
        source: '/docs/context',
        destination: '/docs/server/context',
        permanent: true,
      },
      {
        source: '/docs/merging-routers',
        destination: '/docs/server/merging-routers',
        permanent: true,
      },
      {
        source: '/docs/subscriptions',
        destination: '/docs/server/subscriptions',
        permanent: true,
      },
      {
        source: '/docs/websockets',
        destination: '/docs/server/websockets',
        permanent: true,
      },
      {
        source: '/docs/further/rpc',
        destination: '/docs/rpc',
        permanent: true,
      },
      {
        source: '/docs/further/further-reading',
        destination: '/docs/further-reading',
        permanent: true,
      },
      {
        source: '/docs/further/faq',
        destination: '/docs/faq',
        permanent: true,
      },
      {
        source: '/blog/announcing-trpc-11',
        destination: '/blog/announcing-trpc-v11',
        permanent: true,
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(config);

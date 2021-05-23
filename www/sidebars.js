module.exports = {
  docs: [
    {
      type: 'category',
      label: 'tRPC',
      collapsed: false,
      items: [
        'main/introduction',
        'main/quickstart',
        // 'react/nextjs',
        'main/example-apps',
        'main/contributing',
      ],
    },
    {
      type: 'category',
      label: '@trpc/server',
      collapsed: false,
      items: [
        'server/procedures',
        'server/merging-routers',
        'server/context',
        'server/middlewares',
        'server/error-handling',
        'server/error-formatting',
        'server/data-transformers',
        'server/caching',
      ],
    },
    {
      type: 'category',
      label: '@trpc/client',
      collapsed: false,
      items: ['client/vanilla'],
    },

    {
      type: 'category',
      label: '@trpc/react',
      collapsed: false,
      items: [
        // 'react/nextjs',
        'react/intro',
        'react/queries',
        'react/mutations',
        'react/useInfiniteQuery',
        'react/invalidateQuery',
        // 'react/ssr',
        // 'react/create-react-app',
      ],
    },
    {
      type: 'category',
      label: '@trpc/next',
      collapsed: false,
      items: [
        'nextjs/intro',
        // 'nextjs/app-configuration',
        'nextjs/ssr',
        'nextjs/ssg',
        'nextjs/starter-projects',
      ],
    },
    'further/further-reading',
  ],
};

module.exports = {
  docs: [
    {
      type: 'category',
      label: 'tRPC',
      collapsed: false,
      items: [
        'main/introduction',
        'main/quickstart',
        'main/example-apps',
        'nextjs/intro',
        'react/intro',
        'main/contributing',
        'main/love',
        'main/sponsors',
      ],
    },
    {
      type: 'category',
      label: '@trpc/server',
      collapsed: false,
      items: [
        'server/router',
        'server/merging-routers',
        'server/context',
        'server/middlewares',
        'server/authorization',
        'server/infer-types',
        'server/error-handling',
        'server/error-formatting',
        'server/data-transformers',
        'server/caching',
        'server/express',
      ],
    },
    {
      type: 'category',
      label: '@trpc/client',
      collapsed: false,
      items: [
        //
        'client/vanilla',
        'client/links',
      ],
    },

    {
      type: 'category',
      label: '@trpc/react',
      collapsed: false,
      items: [
        'react/queries',
        'react/mutations',
        'react/useInfiniteQuery',
        'react/invalidateQueries',
      ],
    },
    {
      type: 'category',
      label: '@trpc/next',
      collapsed: false,
      items: ['nextjs/ssr', 'nextjs/ssg', 'nextjs/starter-projects'],
    },
    {
      type: 'category',
      label: 'Extra information',
      collapsed: false,
      items: [
        'further/rpc',
        'further/subscriptions',
        'further/further-reading',
        'further/awesome-trpc',
      ],
    },
  ],
};

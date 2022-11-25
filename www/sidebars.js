module.exports = {
  docs: [
    {
      type: 'category',
      label: 'tRPC',
      collapsed: false,
      link: {
        type: 'doc',
        id: 'main/introduction',
      },
      items: [
        'main/quickstart',
        'main/example-apps',
        'nextjs/introduction',
        'reactjs/introduction',
        'main/contributing',
        'main/love',
        'main/sponsors',
        'main/awesome-trpc',
      ],
    },
    {
      type: 'category',
      label: '@trpc/server',
      collapsed: false,
      link: {
        type: 'generated-index',
        title: '@trpc/server guides',
        slug: '/server',
      },
      items: [
        'server/router',
        'server/procedures',
        'server/merging-routers',
        'server/context',
        'server/middlewares',
        'server/server-side-calls',
        'server/authorization',
        'server/output-validation',
        'server/infer-types',
        'server/error-handling',
        'server/error-formatting',
        'server/data-transformers',
        'server/metadata',
        'server/caching',
        {
          type: 'category',
          label: 'Adapters',
          collapsed: true,
          items: [
            'server/adapter/aws-lambda',
            'server/adapter/express',
            'server/adapter/fastify',
            'server/adapter/fetch',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '@trpc/client',
      collapsed: false,
      link: {
        type: 'generated-index',
        title: '@trpc/client guides',
        slug: '/client',
      },
      items: [
        'client/vanilla',
        'client/aborting-procedures',
        {
          type: 'category',
          label: 'Links',
          collapsed: true,
          link: {
            type: 'doc',
            id: 'client/links/links'
          },
          items: [
            'client/links/httpLink',
            'client/links/httpBatchLink',
            'client/links/wsLink',
            'client/links/splitLink',
            'client/links/loggerLink',
          ],
        },
        'client/header',
        'client/cors',
      ],
    },
    {
      type: 'category',
      label: '@trpc/react-query',
      collapsed: false,
      link: {
        type: 'generated-index',
        title: '@trpc/react-query guides',
        slug: '/react-query',
      },
      items: [
        'reactjs/queries',
        'reactjs/mutations',
        'reactjs/useInfiniteQuery',
        'reactjs/useContext',
      ],
    },
    {
      type: 'category',
      label: '@trpc/next',
      collapsed: false,
      link: {
        type: 'generated-index',
        title: '@trpc/next guides',
        slug: '/next',
      },
      items: [
        'nextjs/ssr',
        'nextjs/ssg',
        'nextjs/ssg-helpers',
        'nextjs/starter-projects',
      ],
    },
    {
      type: 'category',
      label: 'Extra information',
      collapsed: false,
      link: {
        type: 'generated-index',
        title: 'Extra information',
        slug: '/extra',
      },
      items: [
        'further/rpc',
        'further/subscriptions',
        'further/further-reading',
      ],
    },
    {
      type: 'doc',
      id: 'migration/migrate-from-v9-to-v10',
    },
  ],
};

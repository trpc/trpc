import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/old-notes')({
  beforeLoad: () => {
    throw redirect({
      to: '/posts/$slug',
      params: { slug: 'keeping-your-urls' },
      statusCode: 308,
    })
  },
})

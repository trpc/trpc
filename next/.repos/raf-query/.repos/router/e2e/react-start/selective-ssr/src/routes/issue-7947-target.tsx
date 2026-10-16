import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/issue-7947-target')({
  ssr: false,
  // A different head shape exposes redirects that land before hydration as
  // React's structural hydration error #418.
  head: () => ({
    meta: [
      { title: 'Issue 7947 target' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'description', content: 'beforeLoad redirect target' },
    ],
  }),
  component: () => <div data-testid="issue-7947-target">Target</div>,
})

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/issue-4614')({
  ssr: false,
  beforeLoad: ({ context, cause, preload, search }) => {
    ;(globalThis as any).__issue4614TargetBeforeLoad = {
      cause,
      preload,
      rootContext: context.root,
      issue4614Context: context.issue4614Context,
      scenario: search.issue4614 ?? 'cached',
    }
  },
  component: () => <div data-testid="issue-4614-page">Issue 4614</div>,
})

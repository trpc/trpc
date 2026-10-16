import * as React from 'react'
import {
  Link,
  createFileRoute,
  useBlocker,
  useRouter,
} from '@tanstack/react-router'

export const Route = createFileRoute('/history-blocking')({
  validateSearch: (search: Record<string, unknown>) => ({
    step: Number(search.step) || 0,
  }),
  component: HistoryBlocking,
})

function HistoryBlocking() {
  const router = useRouter()
  const { step } = Route.useSearch()
  const [draft, setDraft] = React.useState('')
  const [ignoreBlocker, setIgnoreBlocker] = React.useState(false)
  const [documentHref, setDocumentHref] = React.useState('/')
  const [navigationError, setNavigationError] = React.useState('')
  const { status, reset, proceed } = useBlocker({
    shouldBlockFn: () => draft.length > 0,
    enableBeforeUnload: draft.length > 0,
    withResolver: true,
  })

  return (
    <div>
      <h1>History blocking</h1>
      <p>Step {step}</p>
      <label>
        Draft
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={ignoreBlocker}
          onChange={(event) => setIgnoreBlocker(event.target.checked)}
        />
        Ignore blockers
      </label>
      <p>{draft ? 'Unsaved changes' : 'No changes'}</p>
      <p>Blocker status: {status}</p>
      {status === 'blocked' && (
        <>
          <button onClick={reset}>Stay here</button>
          <button onClick={proceed}>Continue navigation</button>
        </>
      )}
      <label>
        Document destination
        <input
          value={documentHref}
          onChange={(event) => setDocumentHref(event.target.value)}
        />
      </label>
      {[false, true].map((replace) => (
        <button
          key={String(replace)}
          onClick={() => {
            setNavigationError('')
            void router
              .navigate({
                href: documentHref,
                reloadDocument: true,
                replace,
                ignoreBlocker,
              })
              .catch((error) => setNavigationError(String(error)))
          }}
        >
          {replace ? 'Replace document' : 'Navigate document'}
        </button>
      ))}
      {navigationError && <p role="status">{navigationError}</p>}
      <Link to="/history-blocking" search={{ step: step + 1 }}>
        Add history entry
      </Link>
      <button
        onClick={() =>
          router.history.back(
            ignoreBlocker ? { ignoreBlocker: true } : undefined,
          )
        }
      >
        History back
      </button>
      <button
        onClick={() =>
          router.history.forward(
            ignoreBlocker ? { ignoreBlocker: true } : undefined,
          )
        }
      >
        History forward
      </button>
      {[-2, -1, 0, 1, 2].map((delta) => (
        <button
          key={delta}
          onClick={() =>
            router.history.go(
              delta,
              ignoreBlocker ? { ignoreBlocker: true } : undefined,
            )
          }
        >
          History go({delta})
        </button>
      ))}
      <a href="/">Leave document</a>
    </div>
  )
}

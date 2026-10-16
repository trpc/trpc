import {
  createFileRoute,
  redirect,
  useHydrated,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { getAccount, signOut, toggleSaved } from '../server/account'
export const Route = createFileRoute('/saved')({
  loader: async () => {
    const account = await getAccount()
    if (!account) {
      throw redirect({ to: '/login' })
    }
    return account
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({
    meta: [
      { title: 'Saved articles | Field notes' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Saved,
})
function Saved() {
  const hydrated = useHydrated()
  const account = Route.useLoaderData()
  const toggle = useServerFn(toggleSaved),
    logout = useServerFn(signOut)
  const router = useRouter()
  const [pending, setPending] = useState(false),
    [error, setError] = useState('')
  return (
    <main>
      <h1>Saved articles</h1>
      <p>{account.email}</p>
      <p data-testid="saved-state">
        {account.saved ? 'Keeping your URLs is saved' : 'No saved articles'}
      </p>
      <button
        disabled={!hydrated || pending}
        onClick={async () => {
          setPending(true)
          setError('')
          try {
            await toggle()
            await router.invalidate()
          } catch {
            setError('Could not save the article. Try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        {account.saved ? 'Remove article' : 'Save article'}
      </button>
      <button
        disabled={!hydrated || pending}
        onClick={async () => {
          setPending(true)
          setError('')
          try {
            await logout()
            await router.invalidate()
          } catch {
            setError('Could not sign out. Try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        Sign out
      </button>
      <p role="alert">{error}</p>
    </main>
  )
}

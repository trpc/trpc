import { createFileRoute, useHydrated, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { signIn } from '../server/account'
export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [
      { title: 'Sign in | Field notes' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Login,
})
function Login() {
  const hydrated = useHydrated()
  const login = useServerFn(signIn)
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  return (
    <main>
      <h1>Sign in</h1>
      <form
        method="post"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const email = form.get('email'),
            password = form.get('password')
          if (typeof email !== 'string' || typeof password !== 'string') {
            return
          }
          setPending(true)
          setError('')
          try {
            const result = await login({ data: { email, password } })
            if (result.error) {
              setError(result.error)
              return
            }
            await router.invalidate()
            await router.navigate({ to: '/saved' })
          } catch {
            setError('Sign-in failed. Try again.')
          } finally {
            setPending(false)
          }
        }}
      >
        <fieldset disabled={!hydrated || pending}>
          <label>
            Email{' '}
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password{' '}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={pending}>Sign in</button>
        </fieldset>
        <p role="alert">{error}</p>
      </form>
    </main>
  )
}

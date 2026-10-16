import {
  createFileRoute,
  Outlet,
  useHydrated,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  getCurrentUserFn,
  getPrivateDataFn,
  loginFn,
  logoutFn,
} from '../utils/auth-docs'

export const Route = createFileRoute('/auth-docs')({
  beforeLoad: async () => ({ user: await getCurrentUserFn() }),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  component: AuthDocs,
})

function AuthDocs() {
  const hydrated = useHydrated()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const login = useServerFn(loginFn)
  const logout = useServerFn(logoutFn)
  const getPrivateData = useServerFn(getPrivateDataFn)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [privateResult, setPrivateResult] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = formData.get('email')
    const password = formData.get('password')
    if (typeof email !== 'string' || typeof password !== 'string') {
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const result = await login({ data: { email, password } })
      if (result?.error) {
        setError(result.error)
        return
      }
      await router.invalidate()
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <p data-testid="auth-docs-user">{user?.email ?? 'Signed out'}</p>
      <form method="post" onSubmit={handleSubmit}>
        <fieldset disabled={!hydrated || isLoading}>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" required />
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </fieldset>
        <p role="alert">{error}</p>
      </form>
      <button
        onClick={async () => {
          await logout()
          await router.invalidate()
        }}
      >
        Logout
      </button>
      <button
        onClick={async () => {
          try {
            setPrivateResult(await getPrivateData())
          } catch {
            setPrivateResult('Access denied')
          }
        }}
      >
        Request private data directly
      </button>
      <p data-testid="auth-docs-private-result">{privateResult}</p>
      <Outlet />
    </div>
  )
}

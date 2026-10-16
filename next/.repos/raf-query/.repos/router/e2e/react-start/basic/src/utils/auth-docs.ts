import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { useSession } from '@tanstack/react-start/server'

function getSession() {
  return useSession<{ email?: string }>({
    name: 'auth-docs-test',
    password: 'authentication-docs-browser-test-secret-only-2026',
  })
}

export const getCurrentUserFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    return session.data.email ? { email: session.data.email } : null
  },
)

export const loginFn = createServerFn({ method: 'POST' })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    // Fixed credentials belong only to this browser-test fixture.
    if (
      data.email !== 'reader@example.com' ||
      data.password !== 'test-password'
    ) {
      return { error: 'Invalid credentials' }
    }
    const session = await getSession()
    await session.update({ email: data.email })
    throw redirect({ to: '/auth-docs/private' })
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await getSession()
  await session.clear()
  throw redirect({ to: '/auth-docs' })
})

export const getPrivateDataFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    if (!session.data.email) {
      throw new Error('Unauthorized')
    }
    return 'Private account data'
  },
)

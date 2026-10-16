import { createServerFn } from '@tanstack/react-start'
import {
  useSession,
  setResponseStatus,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
async function session() {
  setResponseHeader('Cache-Control', 'private, no-store')
  const password = process.env.SESSION_PASSWORD
  if (!password || password.length < 32) {
    throw new Error('Set SESSION_PASSWORD to at least 32 characters')
  }
  return useSession<{ email: string; saved: boolean }>({
    name: 'start-migration-session',
    password,
  })
}
export const getAccount = createServerFn({ method: 'GET' }).handler(
  async () => {
    const current = await session()
    return current.data.email
      ? { email: current.data.email, saved: current.data.saved ?? false }
      : null
  },
)
export const signIn = createServerFn({ method: 'POST' })
  .validator((input: { email: string; password: string }) => {
    if (typeof input.email !== 'string' || typeof input.password !== 'string') {
      throw new Error('Invalid credentials')
    }
    return input
  })
  .handler(async ({ data }) => {
    if (!process.env.DEMO_PASSWORD) {
      throw new Error('Set DEMO_PASSWORD before running the example')
    }
    if (
      data.email !== 'reader@example.com' ||
      data.password !== process.env.DEMO_PASSWORD
    ) {
      return { error: 'Invalid credentials' }
    }
    const current = await session()
    await current.update({ email: data.email, saved: false })
    return { error: '' }
  })
export const toggleSaved = createServerFn({ method: 'POST' }).handler(
  async () => {
    const current = await session()
    if (!current.data.email) {
      setResponseStatus(401)
      throw new Error('Unauthorized')
    }
    await current.update({ saved: !current.data.saved })
  },
)
export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const current = await session()
  await current.clear()
  throw redirect({ to: '/login' })
})

import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
export async function getSession() {
  const cookieStore = await cookies()
  const password = process.env.SESSION_PASSWORD
  if (!password || password.length < 32) {
    throw new Error('Set SESSION_PASSWORD to at least 32 characters')
  }
  return getIronSession<{ email: string; saved: boolean }>(cookieStore, {
    cookieName: 'next-migration-session',
    password,
    cookieOptions: { secure: process.env.NODE_ENV === 'production' },
  })
}

'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '../account'
export async function signIn(_state: { error: string }, form: FormData) {
  if (!process.env.DEMO_PASSWORD) {
    throw new Error('Set DEMO_PASSWORD before running the example')
  }
  const email = form.get('email'),
    password = form.get('password')
  if (
    email !== 'reader@example.com' ||
    password !== process.env.DEMO_PASSWORD
  ) {
    return { error: 'Invalid credentials' }
  }
  const session = await getSession()
  session.email = email
  session.saved = false
  await session.save()
  redirect('/saved')
}
export async function toggleSaved() {
  const session = await getSession()
  if (!session.email) {
    throw new Error('Unauthorized')
  }
  session.saved = !session.saved
  await session.save()
  revalidatePath('/saved')
}
export async function signOut() {
  const session = await getSession()
  session.destroy()
  redirect('/login')
}

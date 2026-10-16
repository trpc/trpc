import { redirect } from 'next/navigation'
import { getSession } from '../../account'
import { signOut, toggleSaved } from '../actions'
export const metadata = {
  title: 'Saved articles | Field notes',
  robots: { index: false },
}
export default async function Saved() {
  const session = await getSession()
  if (!session.email) {
    redirect('/login')
  }
  return (
    <main>
      <h1>Saved articles</h1>
      <p>{session.email}</p>
      <p data-testid="saved-state">
        {session.saved ? 'Keeping your URLs is saved' : 'No saved articles'}
      </p>
      <form action={toggleSaved}>
        <button>{session.saved ? 'Remove article' : 'Save article'}</button>
      </form>
      <form action={signOut}>
        <button>Sign out</button>
      </form>
    </main>
  )
}

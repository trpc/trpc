'use client'
import { useActionState } from 'react'
import { signIn } from '../actions'
export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { error: '' })
  return (
    <form action={action}>
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
      <p role="alert">{state.error}</p>
    </form>
  )
}

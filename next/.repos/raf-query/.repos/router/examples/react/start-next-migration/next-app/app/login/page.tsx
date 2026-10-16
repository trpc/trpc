import { LoginForm } from './form'
export const metadata = {
  title: 'Sign in | Field notes',
  robots: { index: false },
}
export default function Login() {
  return (
    <main>
      <h1>Sign in</h1>
      <LoginForm />
    </main>
  )
}

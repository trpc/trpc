import Link from 'next/link'
export default function NotFound() {
  return (
    <main>
      <h1>Article not found</h1>
      <Link href="/">All articles</Link>
    </main>
  )
}

import Link from 'next/link'
import type { ReactNode } from 'react'
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Field notes</Link>
          {' | '}
          <Link href="/saved">Saved articles</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}

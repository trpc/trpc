import type { Metadata } from 'next'
import { Providers } from './providers'
import './global.css'

export const metadata: Metadata = {
  title: 'oRPC Next.js Playground',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

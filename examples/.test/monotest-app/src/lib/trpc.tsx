'use client'

import { useState } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'

import type { AppRouter } from '@monotest/api'

export const trpcReact = createTRPCReact<AppRouter>()
trpcReact.router01

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  if (process.env['VERCEL_URL']) {
    return `https://${process.env['VERCEL_URL']}`
  }
  return `http://localhost:${String(process.env['PORT'])}`
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    trpcReact.createClient({
      links: [
        httpBatchLink({
          url: getBaseUrl() + '/api/trpc',
        }),
      ],
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </trpcReact.Provider>
    </QueryClientProvider>
  )
}

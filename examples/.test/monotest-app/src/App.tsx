import { router01Api } from './lib/router01'
import { trpcReact } from './lib/trpc'

export function App() {
  const q1 = trpcReact.router01.foo.useQuery() // <-- bug in trpc?
  const q2 = router01Api.foo.useQuery() // <-- speedy and works with go to definition

  if (q2.data === 'bar') {
  }

  // 1. run `bun dev`
  // 2. change `generated-routers/router0/src/index.ts` and see it update here
  return <h1>{q1.data ?? 'Loading...'}</h1>
}

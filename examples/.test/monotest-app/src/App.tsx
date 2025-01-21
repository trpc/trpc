
import { trpcReact } from './lib/trpc'

export function App() {
  const q1 = trpcReact.router01.foo.useQuery() // <-- bug in trpc?
  trpcReact.createClient({
    links: []
  })

  q1.data;

  return null
}

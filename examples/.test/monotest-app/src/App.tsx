
import { useEffect } from 'react';
import { trpcReact } from './trpc-setup'

export function App() {
  const q1 = trpcReact.router01.foo.useQuery()
  
  const client = trpcReact.useUtils().client;

  useEffect(() => {
    client.router01.foo.query()
  }, [client])




  q1.data;
  // ^?

  return null
}

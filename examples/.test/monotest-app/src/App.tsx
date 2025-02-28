import { useEffect } from 'react';
import { trpcReact, TRPCReactProvider } from './react-setup';

function MyComponent() {
  const q1 = trpcReact.router01.foo.useQuery();

  const client = trpcReact.useUtils().client;

  useEffect(() => {
    void client.router01.foo.query();
  }, [client]);

  q1.data;
  // ^?

  return null;
}

export function App() {
  return (
    <TRPCReactProvider>
      <MyComponent />
    </TRPCReactProvider>
  );
}

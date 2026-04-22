import { FateClient as FateClientProvider } from 'react-fate';
import { Greeting } from './Greeting';
import { createFateClient } from './utils/fate';

const fate = createFateClient();

export function App() {
  return (
    <FateClientProvider client={fate}>
      <Greeting />
    </FateClientProvider>
  );
}

import { useQuery } from '@tanstack/react-query';
/**
 * This is a Next.js page.
 */
import { useTRPC } from '../utils/trpc';

export default function IndexPage() {
  const trpc = useTRPC();
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const result = useQuery(trpc.router99.greeting.queryOptions({ who: 'KATT' }));

  if (!result.data) {
    return (
      <div style={styles}>
        <h1>Loading...</h1>
      </div>
    );
  }
  return (
    <div style={styles}>
      <h1>{result.data}</h1>
    </div>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

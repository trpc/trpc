/**
 * This is a Next.js page.
 */
import { useEffect } from 'react';
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const iteratorResult = trpc.greeting.useMutation({ streaming: true });
  const flatResult = trpc.greetingFlat.useMutation({ streaming: false });
  const trpcContext = trpc.useContext();

  useEffect(() => {
    iteratorResult.mutateAsync({ name: 'iterator' });
    flatResult.mutateAsync({ name: 'flat' });
  }, []);

  return (
    <div style={styles}>
      ITERATOR:
      {iteratorResult.data ? (
        <h1>{iteratorResult.data.text}</h1>
      ) : (
        <h1>Loading Iterator...</h1>
      )}
      FLAT:
      {flatResult.data ? (
        <h1>{flatResult.data.text}</h1>
      ) : (
        <h1>Loading Flat...</h1>
      )}
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

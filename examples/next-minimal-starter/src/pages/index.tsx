/**
 * This is a Next.js page.
 */
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const result1 = trpc.greeting.useQuery({
    name: 'wait a bit longer',
    wait: 2000,
  });
  const result2 = trpc.greeting.useQuery({ name: 'wait a bit', wait: 1000 });

  return (
    <div style={styles}>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: Hover over `data` to see the result type
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div>result1: {result1.data ? result1.data.text : '...waiting'}</div>
        <div>result2: {result2.data ? result2.data.text : '...waiting'}</div>
      </div>
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

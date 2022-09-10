/**
 * This is a Next.js page that queries your backend.
 */
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const helloResult = trpc.greeting.useQuery({ name: 'client' });

  // 💡 Tip: CMD+Click (or CTRL+Click) on `hello` to go to the server definition
  if (!helloResult.data) {
    return (
      <div style={styles}>
        <h1>Loading...</h1>
      </div>
    );
  }
  return (
    <div style={styles}>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <h1>{helloResult.data.text}</h1>
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

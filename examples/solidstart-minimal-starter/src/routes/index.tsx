import { type VoidComponent } from 'solid-js';
import { Head, Link, Meta, Title } from 'solid-start';
import { trpc } from '~/utils/trpc';

export default function Home() {
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const hello = trpc.greeting.useQuery(() => ({ name: 'from tRPC' }));
  return (
    <div style={styles}>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: Hover over `data` to see the result type
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <h1>{hello.data?.text ?? 'Loading tRPC Query'}</h1>
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

/**
 * This is a Next.js page.
 */
import { skipToken } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const [name, setName] = useState<string | undefined>();

  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const result = trpc.greeting.useQuery(name ? { name: name } : skipToken);

  const textInput = (
    <input
      onChange={(e) => {
        setName(e.currentTarget.value);
      }}
      value={name ?? ''}
    />
  );

  if (result.isLoading) {
    return (
      <div style={styles}>
        <h1>Loading...</h1>
        {textInput}
      </div>
    );
  }

  if (!result.data) {
    return (
      <div style={styles}>
        <h1>Type your name below</h1>
        {textInput}
      </div>
    );
  }

  return (
    <div style={styles}>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: Hover over `data` to see the result type
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <h1>{result.data.text}</h1>
      {textInput}
    </div>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'column',
} as const;

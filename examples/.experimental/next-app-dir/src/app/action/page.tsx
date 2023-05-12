import { Suspense } from 'react';
import { api } from 'trpc-api';
import { TestMutation } from '../TestMutation';

export default async function Home() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '1.1rem',
      }}
    >
      <div
        style={{
          width: '12rem',
          padding: '1rem',
          background: '#e5e5e5',
          borderRadius: '0.5rem',
        }}
      >
        <h2>Mutation play</h2>
        <TestMutation />
      </div>
    </main>
  );
}

async function StreamedSC(props: { promise: Promise<string> }) {
  const data = await props.promise;

  return <div>{data}</div>;
}

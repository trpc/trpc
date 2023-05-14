import { Suspense } from 'react';
import { api } from 'trpc-api';
import { TestMutation } from './TestMutation';

export default async function Home() {
  return (
    <>
      <h2>Mutation play</h2>
      <TestMutation />
    </>
  );
}

async function StreamedSC(props: { promise: Promise<string> }) {
  const data = await props.promise;

  return <div>{data}</div>;
}

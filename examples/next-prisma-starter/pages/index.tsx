import Head from 'next/head';
import { ReactQueryDevtools } from 'react-query/devtools';
// import { inferQueryOutput } from '../utils/trpc';
// type Task = inferQueryOutput<'todos.all'>[number];

export default function IndexPage() {
  return (
    <>
      <Head>
        <title>Empty Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h1>Welcome to your Empty tRPC starter</h1>
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
}

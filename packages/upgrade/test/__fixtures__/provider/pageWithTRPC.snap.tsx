import type { NextPage } from 'next';
import { trpc } from './next';

// Classic `withTRPC` wrapped pages too; the new one wraps the App
const Page: NextPage<{ title: string }> = ({ title }) => <h1>{title}</h1>;
Page.getInitialProps = () => ({ title: 'hello' });

// TODO(@trpc/upgrade): the new `withTRPC` wraps your App: call it in `pages/_app`, and drop it here, see https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext
export default trpc.withTRPC(Page);

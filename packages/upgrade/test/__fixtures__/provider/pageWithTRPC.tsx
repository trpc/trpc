import type { NextPage } from 'next';
import { trpc } from './next';

// Classic `withTRPC` wrapped pages too; the new one wraps the App
const Page: NextPage<{ title: string }> = ({ title }) => <h1>{title}</h1>;
Page.getInitialProps = () => ({ title: 'hello' });

export default trpc.withTRPC(Page);

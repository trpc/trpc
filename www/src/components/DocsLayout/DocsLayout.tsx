import { MDXProvider } from '@mdx-js/react';
import Head from 'next/head';
import { FC, ReactNode } from 'react';
import { components } from '../../MDXComponents';

interface DocsLayoutProps {
  children: ReactNode;
  meta: {
    title: string;
  };
}

export const DocsLayout: FC<DocsLayoutProps> = ({ children, meta }) => {
  return (
    <>
      <Head>
        <title>{meta.title} | tRPC</title>
      </Head>
      <MDXProvider components={components as any}>
        <div>
          <nav>Navbar</nav>
          <div className="grid grid-cols-[256px_1fr] px-12 py-8">
            <ul>Sidebar</ul>
            <div>{children}</div>
          </div>
        </div>
      </MDXProvider>
    </>
  );
};

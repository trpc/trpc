import { MDXProvider } from '@mdx-js/react';
import Head from 'next/head';
import { FC, ReactNode } from 'react';
import { components } from '../../MDXComponents';
import { DocsSidebar } from '../DocsSidebar';

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
        <div className="">
          <nav className="px-16 py-6">Navbar</nav>
          <div className="grid grid-cols-[256px_1fr] px-12">
            <DocsSidebar />
            <div className="px-12 pt-6">{children}</div>
          </div>
        </div>
      </MDXProvider>
    </>
  );
};

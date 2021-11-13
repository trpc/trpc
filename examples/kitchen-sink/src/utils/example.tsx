/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { HomeIcon } from '@heroicons/react/solid';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { trpc } from './trpc';
import Highlight, { defaultProps } from 'prism-react-renderer';
import { Fragment, ReactNode } from 'react';
import { UseQueryResult } from 'react-query';
// import { Pre, Line, LineNo, LineContent } from './styles';

interface SourceFile {
  title: string;
  path: string;
}
export interface ExampleProps {
  title: string;
  href: string;
  /**
   * Summary - shown on home page
   */
  summary?: JSX.Element;
  /**
   * Detail page components
   */
  detail?: JSX.Element;
  /**
   * Files for "View Source" in the UI
   */
  files: SourceFile[];
}

export default function Breadcrumbs(props: {
  pages: { title: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol role="list" className="flex items-center space-x-4">
        <li>
          <div>
            <Link href="/">
              <a className="text-gray-400 hover:text-gray-500">
                <HomeIcon
                  className="flex-shrink-0 h-5 w-5"
                  aria-hidden="true"
                />
                <span className="sr-only">Home</span>
              </a>
            </Link>
          </div>
        </li>
        {props.pages.map((page) => (
          <li key={page.href}>
            <div className="flex items-center">
              <svg
                className="flex-shrink-0 h-5 w-5 text-gray-300"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
              </svg>
              <Link href={page.href}>
                <a
                  href={page.href}
                  className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                  aria-current={
                    router.pathname === page.href ? 'page' : undefined
                  }
                >
                  {page.title}
                </a>
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Code(props: { contents: string; language: string }) {
  return (
    <Highlight
      {...defaultProps}
      // theme={theme}
      code={props.contents}
      language="tsx"
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} p-4 ml-4`} style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line, key: i })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token, key })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

function ViewSource(props: SourceFile) {
  const query = trpc.useQuery([
    'source.getSource',
    {
      path: props.path,
    },
  ]);
  const filename = props.path.split('/').pop()!;
  const language = filename.split('.').pop()!;

  return (
    <details>
      <summary>
        {props.title} (<code>{filename}</code>)
      </summary>
      {query.status === 'loading' && <em>Loading....</em>}
      {query.status === 'success' && (
        <Code contents={query.data.contents} language={language} />
      )}
    </details>
  );
}

function Spinner() {
  return (
    <div>
      <span className="animate animate-spin italic py-2 text-primary-500 inline-block">
        ⏳
      </span>
    </div>
  );
}
export function ExamplePage(
  props: ExampleProps & {
    children?: ReactNode;
    query?: UseQueryResult;
  },
) {
  return (
    <>
      <Head>
        <title>{props.title}</title>
      </Head>

      <div className="bg-primary-400">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
            {props.title}
          </h1>

          <div className="text-primary-200">{props.summary}</div>
        </div>
      </div>
      <main>
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-4 p-4">
          <Breadcrumbs pages={[props]} />
          <hr className="w-full border-t border-gray-300" />
          <div className="prose-sm lg:prose">{props.detail}</div>

          <h2 className="text-xl font-bold">View Source</h2>
          <ul className="list-disc list-inside">
            {props.files.map((file) => (
              <ViewSource key={file.path} {...file} />
            ))}
          </ul>
          <div className="prose-sm lg:prose"></div>
          <hr className="w-full border-t border-gray-300" />

          {props.query ? (
            props.query.data ? (
              props.children
            ) : (
              <Spinner />
            )
          ) : (
            props.children
          )}
        </div>
      </main>
    </>
  );
}

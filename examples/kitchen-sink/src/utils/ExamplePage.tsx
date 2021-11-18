/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { CodeIcon, EyeIcon } from '@heroicons/react/outline';
import { HomeIcon } from '@heroicons/react/solid';
import { Editor, FileMap } from '@prisma/text-editors';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Highlight, { defaultProps } from 'prism-react-renderer';
import theme from 'prism-react-renderer/themes/vsDark';
import React, { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { ClientSuspense, ErrorBoundary } from './ClientSuspense';
import { getImportsFromSource } from './getImportsFromSource';
import { trpc } from './trpc';

interface SourceFile {
  title: string;
  path: string;
}
function clsx(...classes: unknown[]) {
  return classes.filter(Boolean).join(' ');
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

function Code(props: { contents: string; language: string; path: string }) {
  const utils = trpc.useContext();
  const [code, setCode] = useState(props.contents);
  const [types, setTypes] = useState<FileMap>({});

  const modulesCache = useRef(new Set<string>());
  useEffect(() => {
    const modules = getImportsFromSource(code);
    for (const moduleName of modules) {
      const key = props.path + moduleName;
      if (modulesCache.current.has(key)) {
        continue;
      }
      modulesCache.current.add(key);

      utils
        .fetchQuery([
          'source.getDefinitions',
          moduleName.startsWith('.')
            ? { moduleName, relativeTo: props.path }
            : { moduleName },
        ])
        .then((data) => {
          // setTypes((state) => ({
          //   ...state,
          //   moduleName: data.definition,
          // }));
        })
        .catch((err) => {
          console.warn('Could not fetch def for', moduleName, { err });
        });
    }
  }, [code, utils, props.path]);

  return (
    <>
      <div>{/* <Editor lang="ts" value={code} onChange={setCode} /> */}</div>
      <Highlight
        {...defaultProps}
        theme={theme}
        code={props.contents}
        language="tsx"
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} p-4 overflow-scroll rounded`}
            style={style}
          >
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
    </>
  );
}

function basename(path: string) {
  return path.split('/').pop()!;
}

function ViewSource(props: SourceFile) {
  const query = trpc.useQuery(
    [
      'source.getSource',
      {
        path: props.path,
      },
    ],
    {
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  );
  const filename = basename(props.path);
  const language = filename.split('.').pop()!;

  if (!query.data) {
    return <Spinner />;
  }
  return (
    <Code
      contents={query.data.contents}
      language={language}
      path={props.path}
    />
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
  },
) {
  const routerQuery = useRouter().query;

  const utils = trpc.useContext();
  useEffect(() => {
    for (const file of props.files) {
      utils.prefetchQuery(['source.getSource', { path: file.path }]);
    }
  }, [props.files, utils]);
  const [code, setCode] = useState('');

  return (
    <>
      <Head>
        <title>{props.title}</title>
      </Head>

      <Editor
        lang="ts"
        value={code}
        style={{
          gridColumn: '2 / 3',
          gridRow: '2 / -1',
          boxShadow: '2px 0px 8px #0001',
          zIndex: 1,
          borderRight: '1px solid #E2E8F0',
        }}
        onChange={setCode}
      />

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
          <div className="border-l-2 bg-white border-primary-400 overflow-hidden py-2 px-4 space-y-2">
            <div className="prose-lg">
              <h3>{props.title}</h3>
              {props.detail || props.summary}
            </div>
          </div>
          <div id="content">
            <div className="flex justify-between sticky top-0 bg-primary-100 bg-opacity-50">
              <div></div>
              <div className="btn-group top-0">
                <Link
                  href={{ query: { file: undefined }, hash: 'content' }}
                  scroll={false}
                >
                  <a
                    className={clsx('btn', !routerQuery.file && 'btn--active')}
                  >
                    <EyeIcon className="btn__icon" aria-hidden="true" />
                    Preview
                  </a>
                </Link>
                {props.files.map((file) => (
                  <Link
                    href={{
                      query: {
                        file: file.path,
                      },
                      hash: 'content',
                    }}
                    scroll={false}
                    key={file.path}
                  >
                    <a
                      className={clsx(
                        'btn',
                        routerQuery.file === file.path && 'btn--active',
                      )}
                    >
                      <CodeIcon className="btn__icon" aria-hidden="true" />
                      {/* {file.title} */}
                      <code>{basename(file.path)}</code>
                    </a>
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4">
              <ErrorBoundary>
                <ClientSuspense fallback={<Spinner />}>
                  {!routerQuery.file && props.children}
                  {props.files.map((file) => (
                    <Fragment key={file.path}>
                      {file.path === routerQuery.file && (
                        <ViewSource {...file} />
                      )}
                    </Fragment>
                  ))}
                </ClientSuspense>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

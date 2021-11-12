import { HomeIcon } from '@heroicons/react/solid';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

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
export function ExamplePage(props: ExampleProps) {
  return (
    <>
      <Head>
        <title>{props.title}</title>
      </Head>
      <Breadcrumbs pages={[props]} />

      <h1>{props.title}</h1>
      <div className="prose lg:prose-xl">{props.summary}</div>
      <div className="prose-sm lg:prose"></div>
      <hr className="w-full border-t border-gray-300" />
    </>
  );
}

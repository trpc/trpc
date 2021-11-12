import { ExampleProps } from 'utils/example';

export const props: ExampleProps = {
  title: 'Static Site Generation (SSG)',
  href: '/ssg',
  summary: (
    <>
      <p>
        Using Static Site Generation &amp; <code>getStaticProps</code>
      </p>
    </>
  ),
  files: [
    { title: 'Router', path: 'router.ts' },
    { title: 'Page', path: 'page.tsx' },
  ],
};

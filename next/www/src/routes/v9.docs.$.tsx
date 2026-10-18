import { createFileRoute } from '@tanstack/react-router';

import { docHead, DocPage, loadDocPage } from '~/components/doc-page.tsx';
import { v9Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/v9/docs/$')({
  loader: async (args) => loadDocPage(v9Docs, args.params._splat ?? ''),
  head: (args) => docHead(v9Docs, args.params._splat ?? ''),
  component: () => <DocPage doc={Route.useLoaderData().doc} version={v9Docs} />,
});

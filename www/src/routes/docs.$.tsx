import { createFileRoute } from '@tanstack/react-router';

import { docHead, DocPage, loadDocPage } from '~/components/doc-page.tsx';
import { v11Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/docs/$')({
  loader: async (args) => loadDocPage(v11Docs, args.params._splat ?? ''),
  head: (args) => docHead(v11Docs, args.params._splat ?? ''),
  component: () => (
    <DocPage doc={Route.useLoaderData().doc} version={v11Docs} />
  ),
});

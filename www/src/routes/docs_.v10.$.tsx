import { createFileRoute } from '@tanstack/react-router';

import { docHead, DocPage, loadDocPage } from '~/components/doc-page.tsx';
import { v10Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/docs_/v10/$')({
  loader: async (args) => loadDocPage(v10Docs, args.params._splat ?? ''),
  head: (args) => docHead(v10Docs, args.params._splat ?? ''),
  component: () => (
    <DocPage doc={Route.useLoaderData().doc} version={v10Docs} />
  ),
});

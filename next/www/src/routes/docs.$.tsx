import { createFileRoute } from '@tanstack/react-router';

import { docHead, DocPage, loadDocPage } from '~/components/doc-page.tsx';
import { v12Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/docs/$')({
  loader: async (args) => loadDocPage(v12Docs, args.params._splat ?? ''),
  head: (args) => docHead(v12Docs, args.params._splat ?? ''),
  component: () => (
    <DocPage doc={Route.useLoaderData().doc} version={v12Docs} />
  ),
});

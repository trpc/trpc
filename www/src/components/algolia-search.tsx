import '@docsearch/css/dist/_variables.css';
import '@docsearch/css/dist/modal.css';

import { DocSearchModal } from '@docsearch/react/modal';
import { useRouter } from '@tanstack/react-router';
import { createPortal } from 'react-dom';

import { useSearchedDocs, versionAt } from '~/content/docs.ts';
import { algolia, docsearchFilters } from '~/site.ts';

/**
 * A hit's URL on this host: the index has trpc.io's, so on a preview or
 * locally a result opens the page here.
 */
function onThisSite(url: string) {
  const parsed = new URL(url, window.location.href);
  // The crawler anchors a page's title on the layout's `#content`.
  const hash = parsed.hash === '#content' ? '' : parsed.hash;
  return `${parsed.pathname.replace(/(?<=.)\/$/, '')}${parsed.search}${hash}`;
}

/** Algolia's DocSearch modal, over trpc.io's index, as Docusaurus had it. */
export default function AlgoliaSearch(props: { readonly onClose: () => void }) {
  const router = useRouter();
  const version = useSearchedDocs();
  const go = (href: string) => {
    props.onClose();
    void router.navigate({ href });
  };
  return createPortal(
    <DocSearchModal
      apiKey={algolia.apiKey}
      appId={algolia.appId}
      hitComponent={({ children, hit }) => (
        <a
          href={hit.url}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            go(hit.url);
          }}
        >
          {children}
        </a>
      )}
      indices={[
        {
          name: algolia.indexName,
          // The index has v11, v10 and v9's pages; this finds the reader's.
          searchParameters: { filters: docsearchFilters(version.id) },
        },
      ]}
      initialScrollY={window.scrollY}
      navigator={{
        navigate: ({ itemUrl }) => {
          go(itemUrl);
        },
      }}
      onAskAiToggle={() => {}}
      onClose={props.onClose}
      placeholder="Search docs"
      transformItems={(items) =>
        items
          // Records without a `version` pass the filter, whatever their page.
          .filter(
            (item) =>
              versionAt(new URL(item.url, window.location.href).pathname).id ===
              version.id,
          )
          .map((item) => ({ ...item, url: onThisSite(item.url) }))
      }
    />,
    document.body,
  );
}

import { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient } from 'react-query';

export async function getDataFromTree(
  tree: ReactElement,
  queryClient: QueryClient,
) {
  const process = async (): Promise<void> => {
    renderToString(tree);

    if (!queryClient.isFetching()) {
      // nothing to be fetched
      return;
    }

    // wait for queries to resolve
    await new Promise<void>((resolve) => {
      const unsub = queryClient.getQueryCache().subscribe((event) => {
        if (event?.type === 'queryUpdated' && !queryClient.isFetching()) {
          // all queries have been resolved
          // console.log('done!');
          unsub();
          resolve();
        }
      });
    });

    // go further down the tree
    process();
  };

  await process();
}

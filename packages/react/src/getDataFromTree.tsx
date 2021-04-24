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
      return;
    }
    while (true) {
      // tmp hack
      await new Promise((resolve) => setTimeout(resolve, 1));

      if (!queryClient.isFetching()) {
        break;
      }
    }
    process();
  };

  await process();
}

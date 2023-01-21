import { StartClient, mount } from 'solid-start/entry-client';
import { client, queryClient, trpc } from './utils/trpc';

mount(
  () => (
    <trpc.Provider client={client} queryClient={queryClient}>
      <StartClient />
    </trpc.Provider>
  ),
  document,
);

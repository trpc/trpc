import {
  ensureEntry,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import { InfoFooter } from '../../components/footer';
import { HydrateClient, trpc } from '../../trpc/server';
import type { Filter } from '../../utils/filters';
import { filters } from '../../utils/filters';
import { Todos } from './todos';

/**
 * Was `getStaticPaths` with `fallback: false`
 */
export function generateStaticParams() {
  return filters.map((filter) => ({ filter }));
}
export const dynamicParams = false;

/**
 * Was `getStaticProps`' `revalidate: 1` (ISR)
 */
export const revalidate = 1;

/**
 * Starts the page's query from the URL, then hands it to the client
 * component. The tasks are in the first HTML, so there's no loading state 👍
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#nextjs-app-router
 */
export default async function TodosPage(props: {
  params: Promise<{ filter: Filter }>;
}) {
  const { filter } = await props.params;
  const [handles] = await loadHandles(trpc, {
    // Every filter shows the same query: the footer counts all the tasks
    tasks: ensureEntry(trpc.todo.all),
  });

  return (
    <HydrateClient>
      <Todos tasks={handles.tasks} filter={filter} />
      <InfoFooter filter={filter} />
    </HydrateClient>
  );
}

import {
  dehydrate,
  useIsMutating,
  useQueryClient,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import type { inferProcedureOutput } from '@trpc/server';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import clsx from 'clsx';
import type {
  GetStaticPaths,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import superjson from 'superjson';
import 'todomvc-app-css/index.css';
import 'todomvc-common/base.css';
import { InfoFooter } from '../components/footer';
import { createInnerTRPCContext } from '../server/context';
import type { AppRouter } from '../server/routers/_app';
import { appRouter } from '../server/routers/_app';
import { makeQueryClient } from '../utils/query-client';
import { useTRPC } from '../utils/trpc';
import { useClickOutside } from '../utils/use-click-outside';

type Task = inferProcedureOutput<AppRouter['todo']['all']>[number];

/**
 * A stand-in task, shown until the server sends the real one.
 * Kept outside the component: `react/purity` flags `Math.random()` and
 * `new Date()` inside the `mutationOptions()` callbacks.
 */
function makeOptimisticTask(text: string): Task {
  return {
    id: `${Math.random()}`,
    completed: false,
    text,
    createdAt: new Date(),
  };
}

function ListItem(props: { task: Task }) {
  const trpc = useTRPC();
  const { task } = props;

  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const [text, setText] = useState(task.text);

  useEffect(() => {
    setText(task.text);
  }, [task.text]);

  const editTask = useMutation(
    trpc.todo.edit.mutationOptions({
      async onMutate({ id, data }) {
        await queryClient.cancelQueries(trpc.todo.all.pathFilter());
        const allTasks = queryClient.getQueryData(trpc.todo.all.queryKey());
        if (!allTasks) {
          return;
        }
        queryClient.setQueryData(
          trpc.todo.all.queryKey(),
          allTasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...data,
                }
              : t,
          ),
        );
      },
    }),
  );
  const deleteTask = useMutation(
    trpc.todo.delete.mutationOptions({
      async onMutate() {
        await queryClient.cancelQueries(trpc.todo.all.pathFilter());
        const allTasks = queryClient.getQueryData(trpc.todo.all.queryKey());
        if (!allTasks) {
          return;
        }
        queryClient.setQueryData(
          trpc.todo.all.queryKey(),
          allTasks.filter((t) => t.id != task.id),
        );
      },
    }),
  );

  useClickOutside({
    ref: wrapperRef,
    enabled: editing,
    callback() {
      editTask.mutate({
        id: task.id,
        data: { text },
      });
      setEditing(false);
    },
  });

  return (
    <li
      key={task.id}
      className={clsx(editing && 'editing', task.completed && 'completed')}
      ref={wrapperRef}
    >
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={task.completed}
          onChange={(e) => {
            const checked = e.currentTarget.checked;
            editTask.mutate({
              id: task.id,
              data: { completed: checked },
            });
          }}
          autoFocus={editing}
        />
        <label
          onDoubleClick={(e) => {
            setEditing(true);
            e.currentTarget.focus();
          }}
        >
          {text}
        </label>
        <button
          className="destroy"
          onClick={() => {
            deleteTask.mutate(task.id);
          }}
        />
      </div>
      <input
        className="edit"
        value={text}
        ref={inputRef}
        onChange={(e) => {
          const newText = e.currentTarget.value;
          setText(newText);
        }}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            editTask.mutate({
              id: task.id,
              data: { text },
            });
            setEditing(false);
          }
        }}
      />
    </li>
  );
}

type PageProps = InferGetStaticPropsType<typeof getStaticProps>;
export default function TodosPage(props: PageProps) {
  const trpc = useTRPC();
  /*
   * This data will be hydrated from the `prefetch` in `getStaticProps`. This means that the page
   * will be rendered with the data from the server and there'll be no client loading state 👍
   */
  const allTasks = useQuery(
    trpc.todo.all.queryOptions(undefined, {
      staleTime: 3000,
    }),
  );

  const queryClient = useQueryClient();
  const addTask = useMutation(
    trpc.todo.add.mutationOptions({
      async onMutate({ text }) {
        /**
         * Optimistically update the data
         * with the newly added task
         */
        await queryClient.cancelQueries(trpc.todo.all.pathFilter());
        const tasks = allTasks.data ?? [];
        queryClient.setQueryData(trpc.todo.all.queryKey(), [
          ...tasks,
          makeOptimisticTask(text),
        ]);
      },
    }),
  );

  const clearCompleted = useMutation(
    trpc.todo.clearCompleted.mutationOptions({
      async onMutate() {
        await queryClient.cancelQueries(trpc.todo.all.pathFilter());
        const tasks = allTasks.data ?? [];
        queryClient.setQueryData(
          trpc.todo.all.queryKey(),
          tasks.filter((t) => !t.completed),
        );
      },
    }),
  );

  const toggleAll = useMutation(
    trpc.todo.toggleAll.mutationOptions({
      async onMutate({ completed }) {
        await queryClient.cancelQueries(trpc.todo.all.pathFilter());
        const tasks = allTasks.data ?? [];
        queryClient.setQueryData(
          trpc.todo.all.queryKey(),
          tasks.map((t) => ({
            ...t,
            completed,
          })),
        );
      },
    }),
  );

  const number = useIsMutating();
  useEffect(() => {
    // invalidate queries when mutations have settled
    // doing this here rather than in `onSettled()`
    // to avoid race conditions if you're clicking fast
    if (number === 0) {
      void queryClient.invalidateQueries(trpc.todo.all.pathFilter());
    }
  }, [trpc, number, queryClient]);

  const tasksLeft = allTasks.data?.filter((t) => !t.completed).length ?? 0;
  const tasksCompleted = allTasks.data?.filter((t) => t.completed).length ?? 0;

  return (
    <>
      <Head>
        <title>Todos</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <section className="todoapp">
        <header className="header">
          <h1>todos</h1>

          <input
            className="new-todo"
            placeholder="What needs to be done"
            autoFocus
            onKeyDown={(e) => {
              const text = e.currentTarget.value.trim();
              if (e.key === 'Enter' && text) {
                addTask.mutate({ text });
                e.currentTarget.value = '';
              }
            }}
          />
        </header>

        <section className="main">
          <input
            id="toggle-all"
            className="toggle-all"
            type="checkbox"
            checked={tasksCompleted === allTasks.data?.length}
            onChange={(e) => {
              toggleAll.mutate({ completed: e.currentTarget.checked });
            }}
          />
          <label htmlFor="toggle-all">Mark all as complete</label>
          <ul className="todo-list">
            {allTasks.data
              ?.filter(({ completed }) =>
                props.filter === 'completed'
                  ? completed
                  : props.filter === 'active'
                    ? !completed
                    : true,
              )
              .map((task) => (
                <ListItem key={task.id} task={task} />
              ))}
          </ul>
        </section>

        <footer className="footer">
          <span className="todo-count">
            <strong>{tasksLeft} </strong>
            {tasksLeft == 1 ? 'task left' : 'tasks left'}
          </span>

          <ul className="filters">
            {filters.map((filter) => (
              <li key={'filter-' + filter}>
                <Link
                  href={'/' + filter}
                  className={filter == props.filter ? 'selected' : ''}
                >
                  {filter[0].toUpperCase() + filter.slice(1)}
                </Link>
              </li>
            ))}
          </ul>

          {tasksCompleted > 0 && (
            <button
              className="clear-completed"
              onClick={() => {
                clearCompleted.mutate();
              }}
            >
              Clear completed
            </button>
          )}
        </footer>
      </section>

      <InfoFooter filter={props.filter} />
    </>
  );
}

const filters = ['all', 'active', 'completed'] as const;
export const getStaticPaths: GetStaticPaths = async () => {
  const paths = filters.map((filter) => ({
    params: { filter },
  }));

  return {
    paths,
    fallback: false,
  };
};

/**
 * @see https://trpc.io/docs/client/nextjs/pages-router/ssg
 */
export const getStaticProps = async (context: GetStaticPropsContext) => {
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    // There's no request at build time, so use the inner context
    ctx: await createInnerTRPCContext({}),
    queryClient,
  });

  await queryClient.prefetchQuery(trpc.todo.all.queryOptions());

  return {
    props: {
      trpcState: superjson.serialize(dehydrate(queryClient)),
      filter: (context.params?.filter as string) ?? 'all',
    },
    revalidate: 1,
  };
};

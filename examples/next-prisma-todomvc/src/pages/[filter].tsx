import { useIsMutating } from '@tanstack/react-query';
import type { inferProcedureOutput } from '@trpc/server';
import clsx from 'clsx';
import type {
  GetStaticPaths,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import 'todomvc-app-css/index.css';
import 'todomvc-common/base.css';
import { InfoFooter } from '../components/footer';
import type { AppRouter } from '../server/routers/_app';
import { ssgInit } from '../server/ssg-init';
import { trpc } from '../utils/trpc';
import { useClickOutside } from '../utils/use-click-outside';

type Task = inferProcedureOutput<AppRouter['todo']['all']>[number];

function ListItem(props: { task: Task }) {
  const { task } = props;

  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const [text, setText] = useState(task.text);

  useEffect(() => {
    setText(task.text);
  }, [task.text]);

  const editTask = trpc.todo.edit.useMutation({
    async onMutate({ id, data }) {
      await utils.todo.all.cancel();
      const allTasks = utils.todo.all.getData();
      if (!allTasks) {
        return;
      }
      utils.todo.all.setData(
        undefined,
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
  });
  const deleteTask = trpc.todo.delete.useMutation({
    async onMutate() {
      await utils.todo.all.cancel();
      const allTasks = utils.todo.all.getData();
      if (!allTasks) {
        return;
      }
      utils.todo.all.setData(
        undefined,
        allTasks.filter((t) => t.id != task.id),
      );
    },
  });

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
  /*
   * This data will be hydrated from the `prefetch` in `getStaticProps`. This means that the page
   * will be rendered with the data from the server and there'll be no client loading state 👍
   */
  const allTasks = trpc.todo.all.useQuery(undefined, {
    staleTime: 3000,
  });

  const utils = trpc.useUtils();
  const addTask = trpc.todo.add.useMutation({
    async onMutate({ text }) {
      /**
       * Optimistically update the data
       * with the newly added task
       */
      await utils.todo.all.cancel();
      const tasks = allTasks.data ?? [];
      utils.todo.all.setData(undefined, [
        ...tasks,
        {
          id: `${Math.random()}`,
          completed: false,
          text,
          createdAt: new Date(),
        },
      ]);
    },
  });

  const clearCompleted = trpc.todo.clearCompleted.useMutation({
    async onMutate() {
      await utils.todo.all.cancel();
      const tasks = allTasks.data ?? [];
      utils.todo.all.setData(
        undefined,
        tasks.filter((t) => !t.completed),
      );
    },
  });

  const toggleAll = trpc.todo.toggleAll.useMutation({
    async onMutate({ completed }) {
      await utils.todo.all.cancel();
      const tasks = allTasks.data ?? [];
      utils.todo.all.setData(
        undefined,
        tasks.map((t) => ({
          ...t,
          completed,
        })),
      );
    },
  });

  const number = useIsMutating();
  useEffect(() => {
    // invalidate queries when mutations have settled
    // doing this here rather than in `onSettled()`
    // to avoid race conditions if you're clicking fast
    if (number === 0) {
      void utils.todo.all.invalidate();
    }
  }, [number, utils]);

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
              .map((task) => <ListItem key={task.id} task={task} />)}
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

export const getStaticProps = async (context: GetStaticPropsContext) => {
  const ssg = await ssgInit(context);

  await ssg.todo.all.prefetch();

  return {
    props: {
      trpcState: ssg.dehydrate(),
      filter: (context.params?.filter as string) ?? 'all',
    },
    revalidate: 1,
  };
};

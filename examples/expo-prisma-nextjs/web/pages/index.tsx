import Head from 'next/head';
import { RefObject, useEffect, useRef, useState } from 'react';
import 'todomvc-app-css/index.css';
import 'todomvc-common/base.css';
import { inferQueryOutput, trpc } from '../utils/trpc';
import { appRouter, createContext } from './api/trpc/[trpc]';

type Task = inferQueryOutput<'todos.all'>[number];

function useOutsideAlerter({
  ref,
  callback,
  enabled,
}: {
  ref: RefObject<any>;
  callback: () => void;
  enabled: boolean;
}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    /**
     * Alert if clicked on outside of element
     */
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target)) {
        callbackRef.current();
      }
    }
    // Bind the event listener
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, enabled]);
}
function ListItem({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useOutsideAlerter({
    ref: wrapperRef,
    enabled: editing,
    callback() {
      setEditing(false);
    },
  });

  const mutation = trpc.useMutation('todos.edit', {
    async onMutate({ id, data }) {
      await trpc.cancelQuery(['todos.all']);
    },
  });
  return (
    <li
      key={task.id}
      className={editing ? 'editing' : undefined}
      ref={wrapperRef}
    >
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          defaultChecked={task.completed}
        />
        <label
          onDoubleClick={() => {
            setEditing(true);
          }}
        >
          {task.text}
        </label>
        <button className="destroy" />
      </div>
      <input
        className="edit"
        defaultValue={task.text}
        ref={inputRef}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            setEditing(false);
          }
        }}
      />
    </li>
  );
}

export default function Home() {
  const allTasks = trpc.useQuery(['todos.all']);
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
            placeholder="What needs to be done?"
            autoFocus
          />
        </header>
        {/* This section should be hidden by default and shown when there are todos */}
        <section className="main">
          <input id="toggle-all" className="toggle-all" type="checkbox" />
          <label htmlFor="toggle-all">Mark all as complete</label>
          <ul className="todo-list">
            {/* These are here just to show the structure of the list items */}
            {/* List items should get the class `editing` when editing and `completed` when marked as completed */}
            <li className="completed">
              <div className="view">
                <input className="toggle" type="checkbox" defaultChecked />
                <label>Taste JavaScript</label>
                <button className="destroy" />
              </div>
              <input
                className="edit"
                defaultValue="Create a TodoMVC template"
              />
            </li>
            <li>
              <div className="view">
                <input className="toggle" type="checkbox" />
                <label>Buy a unicorn</label>
                <button className="destroy" />
              </div>
              <input className="edit" defaultValue="Rule the web" />
            </li>
            {allTasks.data?.map((task) => (
              <ListItem key={task.id} task={task} />
            ))}
          </ul>
        </section>
        {/* This footer should be hidden by default and shown when there are todos */}
        <footer className="footer">
          {/* This should be `0 items left` by default */}
          <span className="todo-count">
            <strong>
              {allTasks.data?.reduce(
                (sum, task) => (task.completed ? sum + 1 : sum),
                0,
              )}
            </strong>{' '}
            item left
          </span>
          {/* Remove this if you don't implement routing */}
          <ul className="filters">
            <li>
              <a className="selected" href="#/">
                All
              </a>
            </li>
            <li>
              <a href="#/active">Active</a>
            </li>
            <li>
              <a href="#/completed">Completed</a>
            </li>
          </ul>
          {/* Hidden if no completed items are left ↓ */}
          <button className="clear-completed">Clear completed</button>
        </footer>
      </section>
      <footer className="info">
        <p>Double-click to edit a todo</p>
        {/* Remove the below line ↓ */}
        <p>
          Template by <a href="http://sindresorhus.com">Sindre Sorhus</a>
        </p>
        {/* Change this out with your name and url ↓ */}
        <p>
          Created by <a href="http://todomvc.com">you</a>
        </p>
        <p>
          Part of <a href="http://todomvc.com">TodoMVC</a>
        </p>
      </footer>
    </>
  );
}
export async function getStaticProps() {
  const ctx = await createContext();
  const ssr = trpc.ssr(appRouter, ctx);

  await ssr.prefetchQuery('todos.all');

  return {
    props: {
      dehydratedState: trpc.dehydrate(),
    },
    revalidate: 1,
  };
}

'use client';

import { ReactNode, useState } from 'react';
import { useAction } from 'trpc-api';
import { testAction } from './_actions';

function RawFormTestMutation() {
  return (
    <>
      <p>
        Check the network tab and the server console to see that we called this.
        If you don't pass an input, it will fail validation and not reach the
        procedure.
      </p>
      <form action={testAction}>
        <input type="text" name="text" />
        <button type="submit">Run server action raw debugging</button>
      </form>
    </>
  );
}

function RawTestMutation() {
  const [text, setText] = useState('');
  const mutation = useAction(testAction);
  //     ^?

  mutation.status;
  mutation.data;
  //        ^?
  mutation.error;
  //       ^?
  return (
    <>
      <label>
        Text to send: <br />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <br />
      <button
        onClick={async () => {
          const res = await testAction({
            text,
          });
          console.log('result', res);
          //          ^?
          if ('result' in res) {
            res.result;
            res.result.data;
            //           ^?
          } else {
            res.error;
            //   ^?
          }
          alert('Check console');
        }}
      >
        Run server action raw debugging
      </button>
    </>
  );
}

function UseActionTestMutation() {
  const [text, setText] = useState('');
  const mutation = useAction(testAction);
  //     ^?

  mutation.status;
  mutation.data;
  //        ^?
  mutation.error;
  //       ^?
  return (
    <>
      <p>
        <label>
          Text
          <br />
          <input
            type={'text'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="bg-slate-300 text-slate-900"
          />
        </label>
      </p>

      <p>
        <button
          onClick={() =>
            mutation.mutate({
              text,
            })
          }
        >
          Run server action
        </button>
      </p>
      <p>
        <button
          onClick={async () => {
            const res = await testAction({
              text: '',
            });
            console.log(res);
            //          ^?
            if ('result' in res) {
              res.result;
              res.result.data;
              //           ^?
            } else {
              res.error;
              //   ^?
            }
            alert('Check console');
          }}
        >
          Run server action raw debugging
        </button>
      </p>
      <pre
        style={{
          overflowX: 'scroll',
        }}
      >
        {JSON.stringify(mutation, null, 4)}
      </pre>
    </>
  );
}

export function TestMutation() {
  const [text, setText] = useState('');
  const mutation = useAction(testAction);
  //     ^?

  mutation.status;
  mutation.data;
  //        ^?
  mutation.error;
  //       ^?

  const components: {
    Component: React.ComponentType;
    title: ReactNode;
  }[] = [
    {
      title: (
        <>
          <code>UseActionTestMutation</code> -{' '}
          <code>useAction(testAction)</code>
        </>
      ),
      Component: UseActionTestMutation,
    },
    {
      title: (
        <>
          <code>RawTestMutation</code>
          Raw inline call <code>testAction(....)</code>
        </>
      ),
      Component: RawTestMutation,
    },
    {
      title: (
        <>
          <code>&lt;form action=x</code> without any extras
        </>
      ),
      Component: RawFormTestMutation,
    },
  ];
  return (
    <>
      <ul className="details-ul">
        {components.map((it, index) => (
          <details key={index}>
            <summary>{it.title}</summary>
            <div>
              <it.Component />
            </div>
          </details>
        ))}
      </ul>

      <style jsx>{`
        details {
          padding: 1rem 0.5rem;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 0.5rem;
        }
        details > summary {
          padding: 0.5rem;
        }
        details > div {
          padding: 1rem;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 0.25rem;
        }

        .details-ul {
          display: grid;
          grid-gap: 1rem;
          list-style: none;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </>
  );
}

import React from 'react';

export function ConceptsChart() {
  return (
    <table width="100%">
      <thead>
        <tr>
          <th>Term</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <a href="/docs/server/procedures">
              <strong className="text-green-600 dark:text-green-400">
                Procedure&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            API endpoint - can be a{' '}
            <strong className="text-teal-700 dark:text-teal-400">query</strong>,{' '}
            <strong className="text-teal-700 dark:text-teal-400">
              mutation
            </strong>
            , or{' '}
            <strong className="text-teal-700 dark:text-teal-400">
              subscription
            </strong>
            .
          </td>
        </tr>
        <tr>
          <td>
            <strong className="text-teal-700 dark:text-teal-400">Query</strong>
          </td>
          <td>
            A{' '}
            <strong className="text-green-600 dark:text-green-400">
              procedure
            </strong>{' '}
            that gets some data.
          </td>
        </tr>
        <tr>
          <td>
            <strong className="text-teal-700 dark:text-teal-400">
              Mutation
            </strong>
          </td>
          <td>
            A{' '}
            <strong className="text-green-600 dark:text-green-400">
              procedure
            </strong>{' '}
            that creates, updates, or deletes some data.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/subscriptions">
              <strong className="text-teal-700 dark:text-teal-400">
                Subscription&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            A{' '}
            <strong className="text-green-600 dark:text-green-400">
              procedure
            </strong>{' '}
            that creates a persistent connection and listens to changes.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/routers">
              <strong className="text-blue-700 dark:text-blue-400">
                Router&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            A collection of{' '}
            <strong className="text-green-600 dark:text-green-400">
              procedures
            </strong>{' '}
            (and/or other routers) under a shared namespace.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/context">
              <strong className="text-violet-700 dark:text-violet-400">
                Context&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            Stuff that every{' '}
            <strong className="text-green-600 dark:text-green-400">
              procedure
            </strong>{' '}
            can access. Commonly used for things like session state and database
            connections.
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/middlewares">
              <strong className="text-blue-600 dark:text-blue-400">
                Middleware&nbsp;↗
              </strong>
            </a>
          </td>
          <td>
            A function that can run code before and after a{' '}
            <strong className="text-green-600 dark:text-green-400">
              procedure
            </strong>
            . Can modify{' '}
            <strong className="text-violet-700 dark:text-violet-400">
              context
            </strong>
            .
          </td>
        </tr>
        <tr>
          <td>
            <a href="/docs/server/procedures#input-validation">
              <strong className="text-blue-600 dark:text-blue-400">
                Validation&nbsp;↗
              </strong>
            </a>
          </td>
          <td>&quot;Does this input data contain the right stuff?&quot;</td>
        </tr>
      </tbody>
    </table>
  );
}

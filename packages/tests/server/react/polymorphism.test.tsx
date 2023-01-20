/*
  It's common to have a data interface which is used across multiple routes in an API,
  for instance a shared CSV Export system which can be applied to multiple entities in an application.

  By default this can present a challenge in tRPC clients, because the @trpc/react-query package 
  produces router interfaces which are not always considered structurally compatible by typescript.

  The polymorphism types can be used to generate abstract types which routers sharing a common 
  interface are compatible with, and allow you to pass around deep router paths to generic components with ease.
*/
import { routerToServerAndClientNew } from '../___testHelpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { ReactNode, useState } from 'react';

/**
 * We define a router factory which can be used many times.
 *
 * We use the RouterLike and UtilsLike types to generate
 * abstract interfaces which router instances are compatible with
 */
import {
  ExportRouteLike,
  ExportUtilsLike,
  FileExportStatusType,
  createExportRoute,
} from './polymorphism.factory';

/**
 * The tRPC backend is defined here
 */
function createTRPCApi() {
  const t = initTRPC.create();

  /**
   * Backend data sources.
   *
   * Here we use a simple array for demonstration, but in practice these might be
   * an ORM Repository, a microservice's API Client, etc. Whatever you write your own router factory around.
   */
  const IssueExportsProvider: FileExportStatusType[] = [];
  const DiscussionExportsProvider: FileExportStatusType[] = [];
  const PullRequestExportsProvider: FileExportStatusType[] = [];

  /**
   * Create an AppRouter instance, with multiple routes using the data export interface
   */
  const appRouter = t.router({
    github: t.router({
      issues: t.router({
        export: createExportRoute(t.router, t.procedure, IssueExportsProvider),
      }),
      discussions: t.router({
        export: createExportRoute(
          t.router,
          t.procedure,
          DiscussionExportsProvider,
        ),
      }),
      pullRequests: t.router({
        export: createExportRoute(
          t.router,
          t.procedure,
          PullRequestExportsProvider,
        ),
      }),
    }),
  });

  return {
    t,
    appRouter,
    IssueExportsProvider,
    DiscussionExportsProvider,
    PullRequestExportsProvider,
  };
}

/**
 * A general use component which implements a UI for the `createExportRoute` interface
 *  and can be used across all routes which use the factory
 */
function GenericExportsComponent({
  route,
  utils,
}: {
  route: ExportRouteLike;
  utils: ExportUtilsLike;
}) {
  const [currentExport, setCurrentExport] = useState<null | number>(null);

  const exportsList = route.list.useQuery();

  const exportStatus = route.status.useQuery(
    { id: currentExport ?? -1 },
    { enabled: currentExport !== null },
  );

  const exportStarter = route.start.useMutation({
    onSuccess(data) {
      setCurrentExport(data.id);

      utils.invalidate();
    },
  });

  return (
    <>
      <button
        data-testid="startExportBtn"
        onClick={() => {
          exportStarter.mutateAsync({
            filter: 'polymorphism react',
            name: 'Search for Polymorphism React',
          });
        }}
      >
        Start Export
      </button>

      <button
        data-testid="refreshBtn"
        onClick={() => {
          utils.invalidate();
        }}
      >
        Refresh
      </button>

      {exportStatus.data && (
        <p>
          Last Export: `{exportStatus.data?.name}` (
          {exportStatus.data.downloadUri ? 'Ready!' : 'Working'})
        </p>
      )}

      <h4>Downloads:</h4>
      <ul>
        {exportsList.data
          ?.map((item) =>
            item.downloadUri ? (
              <li key={item.id}>
                <a href={item.downloadUri ?? '#'}>{item.name}</a>
              </li>
            ) : null,
          )
          .filter(Boolean)}
      </ul>
    </>
  );
}

describe('polymorphism', () => {
  /**
   * Test setup
   */
  const ctx = konn()
    .beforeEach(() => {
      const {
        appRouter,
        IssueExportsProvider,
        DiscussionExportsProvider,
        PullRequestExportsProvider,
      } = createTRPCApi();

      const opts = routerToServerAndClientNew(appRouter);
      const trpc = createTRPCReact<typeof appRouter>();

      const queryClient = new QueryClient();

      function App(props: { children: ReactNode }) {
        return (
          <trpc.Provider {...{ queryClient, client: opts.client }}>
            <QueryClientProvider client={queryClient}>
              {props.children}
            </QueryClientProvider>
          </trpc.Provider>
        );
      }
      return {
        ...opts,
        App,
        trpc,
        IssueExportsProvider,
        DiscussionExportsProvider,
        PullRequestExportsProvider,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('can pass an arbitrary route to the component so long as it matches the interface', async () => {
    const { trpc } = ctx;

    /**
     * Can now define page components which re-use functionality from the generic one,
     * but pass the specific backend functionality which they need
     */
    function PullRequestsExportPage() {
      const utils = trpc.useContext();

      return (
        <GenericExportsComponent
          route={trpc.github.pullRequests.export}
          utils={utils.github.pullRequests.export}
        />
      );
    }

    /**
     * Test Act & Assertions
     */

    const $ = render(
      <ctx.App>
        <PullRequestsExportPage />
      </ctx.App>,
    );

    $.getByTestId('startExportBtn').click();

    await waitFor(() => {
      expect($.container).toHaveTextContent(
        'Last Export: `Search for Polymorphism React` (Working)',
      );
    });

    $.getByTestId('refreshBtn').click();

    await waitFor(() => {
      expect($.container).toHaveTextContent(
        'Last Export: `Search for Polymorphism React` (Ready!)',
      );
    });
  });
});

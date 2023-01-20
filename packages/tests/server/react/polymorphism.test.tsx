import { routerToServerAndClientNew } from '../___testHelpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { ReactNode, useState } from 'react';
import {
  ExportRouteLike,
  FileExportStatusType,
  createExportRoute,
} from './polymorphism.factory';

describe('polymorphism', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();

      const IssueExportsProvider: FileExportStatusType[] = [];
      const DiscussionExportsProvider: FileExportStatusType[] = [];
      const PullRequestExportsProvider: FileExportStatusType[] = [];

      const appRouter = t.router({
        github: t.router({
          issues: t.router({
            export: createExportRoute(
              t.router,
              t.procedure,
              IssueExportsProvider,
            ),
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

    const $ = render(
      <ctx.App>
        <GenericExportsComponent route={trpc.github.pullRequests.export} />
      </ctx.App>,
    );

    // TODO: functional tests can come later, typechecking does most of the work for POC

    // $.getByTestId('add').click();

    // await waitFor(() => {
    //   expect($.container).toHaveTextContent(nonce);
    // });
  });
});

/**
 * A general use components which implements a UI for the `createExportRoute` interface
 *  and can be used across all routes which use the factory
 */
function GenericExportsComponent({ route }: { route: ExportRouteLike }) {
  const [currentExport, setCurrentExport] = useState<null | number>(null);

  const exportsList = route.list.useQuery();

  const exportStatus = route.status.useQuery(
    { id: currentExport ?? -1 },
    { enabled: currentExport !== null },
  );

  const exportStarter = route.start.useMutation({
    onSuccess(data) {
      setCurrentExport(data.id);
    },
  });

  return (
    <>
      <button
        onClick={() => {
          exportStarter.mutateAsync({
            filter: 'some-filter',
            name: 'Some Export',
          });
        }}
      >
        Start Export
      </button>

      <button
        onClick={() => {
          exportStarter.mutateAsync({
            filter: 'some-filter',
            name: 'Some Export',
          });
        }}
      >
        Refresh
      </button>

      {exportStatus.data && (
        <p>
          Last Export: {exportStatus.data?.name} (
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

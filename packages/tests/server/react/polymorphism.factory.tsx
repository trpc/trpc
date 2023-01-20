//
// This file contains a useful pattern in tRPC,
//  building factories which can produce common functionality over a homologous data source.
//
import {
  DecoratedProcedureUtilsRecord,
  MutationLike,
  QueryLike,
  RouterLike,
  UtilsLike,
} from '@trpc/react-query/shared';
import { AnyRootConfig, TRPCError } from '@trpc/server';
import { createBuilder } from '@trpc/server/core/internals/procedureBuilder';
import { createRouterFactory } from '@trpc/server/core/router';
import z from 'zod';

//
// DTOs
//

export const FileExportRequest = z.object({
  name: z.string().min(0),
  filter: z.string().min(0),
});
export type FileExportRequestType = z.infer<typeof FileExportRequest>;

export const FileExportStatus = z.object({
  id: z.number().min(0),
  name: z.string().min(0),
  downloadUri: z.string().optional(),
  createdAt: z.date(),
});
export type FileExportStatusType = z.infer<typeof FileExportStatus>;

//
// Dependencies
//

type RouterFactory<TConfig extends AnyRootConfig> = ReturnType<
  typeof createRouterFactory<TConfig>
>;
type BaseProcedure<TConfig extends AnyRootConfig> = ReturnType<
  typeof createBuilder<TConfig>
>;

export type DataProvider = FileExportStatusType[];

//
// Set up a route factory which can be re-used for different data sources.
// In this case just with a simple array data source a POC
//

let COUNTER = 1;

export function createExportRoute<
  TConfig extends AnyRootConfig,
  TRouterFactory extends RouterFactory<TConfig>,
  TBaseProcedure extends BaseProcedure<TConfig>,
>(
  createRouter: TRouterFactory,
  baseProcedure: TBaseProcedure,
  dataProvider: DataProvider,
) {
  return createRouter({
    start: baseProcedure
      .input(FileExportRequest)
      .output(FileExportStatus)
      .mutation(async (opts) => {
        const exportInstance: FileExportStatusType = {
          id: COUNTER++,
          name: opts.input.name,
          createdAt: new Date(),
          downloadUri: undefined,
        };

        // When status is polled the download should be ready
        dataProvider.push({
          ...exportInstance,
          downloadUri: `example.com/export-${opts.input.filter}.csv`,
        });

        return exportInstance;
      }),
    list: baseProcedure.output(z.array(FileExportStatus)).query(async () => {
      return dataProvider;
    }),
    status: baseProcedure
      .input(z.object({ id: z.number().min(0) }))
      .output(FileExportStatus)
      .query(async (opts) => {
        const exportInstance = dataProvider.find(
          (item) => item.id === opts.input.id,
        );

        if (!exportInstance) {
          throw new TRPCError({
            code: 'NOT_FOUND',
          });
        }

        return exportInstance;
      }),
  });
}

//
// Set up a polymorphic interface which can be used by the client
// Could amost certainly generate this using recursive mapped types, but simple is good for now
//

type ExportRouteType = ReturnType<typeof createExportRoute>;

// export interface ExportRouteLike {
//   start: MutationLike<ExportRouteType['start']>;
//   list: QueryLike<ExportRouteType['list']>;
//   status: QueryLike<ExportRouteType['status']>;
// }

export type ExportRouteLike = RouterLike<ExportRouteType>;

export type ExportUtilsRoute = UtilsLike<ExportRouteType>;

//
// This file extends polymorphism.factory.tsx into a sub-typed router,
//  which can be used with existing components, but has extra data for other use cases
//
import { RouterLike, UtilsLike } from '@trpc/react-query/shared';
import { AnyRootConfig, TRPCError } from '@trpc/server';
import { createBuilder } from '@trpc/server/core/internals/procedureBuilder';
import { createRouterFactory } from '@trpc/server/core/router';
import z from 'zod';
import { FileExportRequest, FileExportStatus } from './polymorphism.factory';

//
// DTO Subtypes
//

const SubTypedFileExportRequest = FileExportRequest.extend({
  description: z.string().min(0),
});

export const SubTypedFileExportStatus = FileExportStatus.extend({
  description: z.string().min(0),
});
export type SubTypedFileExportStatusType = z.infer<
  typeof SubTypedFileExportStatus
>;

//
// Dependencies
//

type RouterFactory<TConfig extends AnyRootConfig> = ReturnType<
  typeof createRouterFactory<TConfig>
>;
type BaseProcedure<TConfig extends AnyRootConfig> = ReturnType<
  typeof createBuilder<TConfig>
>;

export type SubTypedDataProvider = SubTypedFileExportStatusType[];

//
// Set up a route factory which can be re-used for different data sources.
// In this case just with a simple array data source a POC
//

let COUNTER = 1;

export function createSubTypedExportRoute<
  TConfig extends AnyRootConfig,
  TRouterFactory extends RouterFactory<TConfig>,
  TBaseProcedure extends BaseProcedure<TConfig>,
>(
  createRouter: TRouterFactory,
  baseProcedure: TBaseProcedure,
  dataProvider: SubTypedDataProvider,
) {
  return createRouter({
    start: baseProcedure
      .input(SubTypedFileExportRequest)
      .output(SubTypedFileExportStatus)
      .mutation(async (opts) => {
        const exportInstance: SubTypedFileExportStatusType = {
          id: COUNTER++,
          name: opts.input.name,
          description: opts.input.description,
          createdAt: new Date(),
          downloadUri: undefined,
        };

        dataProvider.push(exportInstance);

        return exportInstance;
      }),
    list: baseProcedure
      .output(z.array(SubTypedFileExportStatus))
      .query(async () => {
        return dataProvider;
      }),
    status: baseProcedure
      .input(z.object({ id: z.number().min(0) }))
      .output(SubTypedFileExportStatus)
      .query(async (opts) => {
        const index = dataProvider.findIndex(
          (item) => item.id === opts.input.id,
        );

        const exportInstance = dataProvider[index];

        if (!exportInstance) {
          throw new TRPCError({
            code: 'NOT_FOUND',
          });
        }

        // When status is polled a second time the download should be ready
        dataProvider[index] = {
          ...exportInstance,
          downloadUri: `example.com/export-${exportInstance.name}.csv`,
        };

        return exportInstance;
      }),
    delete: baseProcedure
      .input(z.object({ id: z.number().min(0) }))
      .mutation((opts) => {
        const index = dataProvider.findIndex(
          (item) => item.id === opts.input.id,
        );

        if (index < 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
          });
        }

        dataProvider.splice(index);
      }),
  });
}

//
// Generate abstract types which can be used by the client
//

type SubTypedExportRouteType = ReturnType<typeof createSubTypedExportRoute>;

export type ExportSubTypedRouteLike = RouterLike<SubTypedExportRouteType>;

export type ExportSubTypesUtilsLike = UtilsLike<SubTypedExportRouteType>;

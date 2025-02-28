//
// This file extends polymorphism.factory.tsx into a sub-typed router,
//  which can be used with existing components, but has extra data for other use cases
//
import type { RouterLike, UtilsLike } from '@trpc/react-query/shared';
import { TRPCError } from '@trpc/server';
import type {
  AnyRootTypes,
  createBuilder,
  createRouterFactory,
} from '@trpc/server/unstable-core-do-not-import';
import z from 'zod';
import { t } from './polymorphism.common';
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

type RouterFactory<TRoot extends AnyRootTypes> = ReturnType<
  typeof createRouterFactory<TRoot>
>;
type BaseProcedure<TRoot extends AnyRootTypes> = ReturnType<
  typeof createBuilder<TRoot['ctx'], TRoot['meta']>
>;

export type SubTypedDataProvider = SubTypedFileExportStatusType[];

//
// Set up a route factory which can be re-used for different data sources.
// In this case just with a simple array data source a POC
//

let COUNTER = 1;

export function createSubTypedExportRoute<
  TBaseProcedure extends BaseProcedure<(typeof t)['_config']['$types']>,
>(baseProcedure: TBaseProcedure, dataProvider: SubTypedDataProvider) {
  return t.router({
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

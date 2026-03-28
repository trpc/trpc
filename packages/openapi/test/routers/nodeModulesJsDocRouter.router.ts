import { initTRPC } from '@trpc/server';
import type { TRPCRequestInfo } from '@trpc/server/http';
import type { AliasOptions } from 'vite';
import type { Diagnostic } from 'vscode-languageserver-types';

const t = initTRPC.create();

type MonorepoImportOutput = {
  requestInfo: TRPCRequestInfo;
};

type LocalNodeModulesImportOutput = {
  diagnostic: Diagnostic;
};

type RootNodeModulesImportOutput = {
  aliasOptions: AliasOptions;
};

export const NodeModulesJsDocRouter = t.router({
  monorepoImport: t.procedure.query(() => ({}) as MonorepoImportOutput),
  localNodeModulesImport: t.procedure.query(
    () => ({}) as LocalNodeModulesImportOutput,
  ),
  rootNodeModulesImport: t.procedure.query(
    () => ({}) as RootNodeModulesImportOutput,
  ),
});

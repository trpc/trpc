import type { BuiltinErrorCode, UndeclaredCode } from '@trpc12/trpc/client';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import type { Closed } from '../closed-errors/closed.ts';
import { AuthShell, type createApp, OfflineShell } from './app.ts';
import type { Remaining } from './shells.ts';

declare const app: ReturnType<typeof createApp>;
type CodeOf<E> = E extends { readonly code: infer C } ? C : never;
type ErrorOf<R> = NonNullable<R extends { error: infer E } ? E : never>;

const renameOptions = () => app.trpc.doc.rename.mutationOptions();
type RenameError = Parameters<
  NonNullable<ReturnType<typeof renameOptions>['onError']>
>[0];

describe('the rename mutation', () => {
  test('its full union', () => {
    expectTypeOf<
      CodeOf<Extract<RenameError, { defined: true }>>
    >().toEqualTypeOf<'UNAUTHORIZED' | 'TITLE_TAKEN' | 'BAD_REQUEST'>();
  });

  test('under Auth, only what no shell owns', () => {
    const rename = () => AuthShell.useMutation(renameOptions());
    expectTypeOf<CodeOf<ErrorOf<ReturnType<typeof rename>>>>().toEqualTypeOf<
      'TITLE_TAKEN' | 'BAD_REQUEST'
    >();
  });

  test('under Offline, UNAUTHORIZED is back', () => {
    const rename = () => OfflineShell.useMutation(renameOptions());
    expectTypeOf<CodeOf<ErrorOf<ReturnType<typeof rename>>>>().toEqualTypeOf<
      'UNAUTHORIZED' | 'TITLE_TAKEN' | 'BAD_REQUEST'
    >();
  });
});

describe('a claim of one boundary code, with no unexpected claim', () => {
  test('subtracts it from the closed union', () => {
    type Left = Remaining<Closed<RenameError>, 'NETWORK_ERROR', false>;
    expectTypeOf<CodeOf<Extract<Left, { defined: false }>>>().toEqualTypeOf<
      Exclude<BuiltinErrorCode, 'NETWORK_ERROR'> | UndeclaredCode
    >();
  });

  test('subtracts it from the client union, which is closed already', () => {
    type Left = Remaining<RenameError, 'NETWORK_ERROR', false>;
    expectTypeOf<CodeOf<Extract<Left, { defined: false }>>>().toEqualTypeOf<
      Exclude<BuiltinErrorCode, 'NETWORK_ERROR'> | UndeclaredCode
    >();
  });
});

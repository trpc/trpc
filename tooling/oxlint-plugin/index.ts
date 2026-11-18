import { eslintCompatPlugin } from '@oxlint/plugins';
import { noSymbolDispose } from './noSymbolDispose.ts';
import { noTestingLibraryWaitFor } from './noTestingLibraryWaitFor.ts';
import { typeParameterNaming } from './typeParameterNaming.ts';

const plugin = eslintCompatPlugin({
  meta: { name: 'trpc' },
  rules: {
    'no-symbol-dispose': noSymbolDispose,
    'no-testing-library-wait-for': noTestingLibraryWaitFor,
    'type-parameter-naming': typeParameterNaming,
  },
});

export default plugin;

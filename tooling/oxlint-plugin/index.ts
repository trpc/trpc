import { eslintCompatPlugin } from '@oxlint/plugins';
import { noSymbolDispose } from './noSymbolDispose.ts';
import { typeParameterNaming } from './typeParameterNaming.ts';

const plugin = eslintCompatPlugin({
  meta: { name: 'trpc' },
  rules: {
    'no-symbol-dispose': noSymbolDispose,
    'type-parameter-naming': typeParameterNaming,
  },
});

export default plugin;

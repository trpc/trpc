declare module 'virtual:kitchen-sink-types' {
  import type { DeclarationBundle } from './ts-service.ts';

  /** Each demo's sample's declarations, loaded on demand (`build/kitchen-sink-types.ts`). */
  const bundles: Readonly<
    Record<string, () => Promise<{ readonly default: DeclarationBundle }>>
  >;
  export default bundles;
}

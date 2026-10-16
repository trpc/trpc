import { state, createState, createSeed } from "shared-runtime.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import('shared-runtime.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
const $$splitLoaderImporter = () => import('shared-runtime.tsx?tsr-split=component---loader---notFoundComponent---pendingComponent');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
console.log('shared-runtime:reference');
export const Route = createFileRoute('/shared-runtime')({
  beforeLoad: () => state,
  loader: lazyFn($$splitLoaderImporter, 'loader'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
function createState(initialState: {
  count: number;
}): {
  state: {
    count: number;
  };
  increment: () => number;
};
export { state as firstState, state as secondState, state as 'odd-name' };
export default createSeed;
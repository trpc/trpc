const $$splitErrorComponentImporter = () => import('lowercase-function-declaration.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitPendingComponentImporter = () => import('lowercase-function-declaration.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
const $$splitComponentImporter = () => import('lowercase-function-declaration.tsx?tsr-split=component---errorComponent---notFoundComponent---pendingComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent: lazyRouteComponent($$splitPendingComponentImporter, 'pendingComponent'),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});
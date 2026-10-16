const $$splitErrorComponentImporter = () => import('lowercase-function-declaration.tsx?tsr-split=errorComponent');
const $$splitComponentImporter = () => import('lowercase-function-declaration.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
  pendingComponent,
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent')
});
function pendingComponent() {
  return <div>lowercase pending function declaration</div>;
}
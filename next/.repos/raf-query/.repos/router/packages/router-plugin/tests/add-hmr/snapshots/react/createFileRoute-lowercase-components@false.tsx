const $$splitComponentImporter = () => import('createFileRoute-lowercase-components.tsx?tsr-split=component');
const $$splitErrorComponentImporter = () => import('createFileRoute-lowercase-components.tsx?tsr-split=errorComponent');
import { lazyRouteComponent } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/lowercase-components')({
  pendingComponent: pendingComponent,
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, 'errorComponent'),
  component: lazyRouteComponent($$splitComponentImporter, 'component')
});
function pendingComponent() {
  return <div>Pending</div>;
}
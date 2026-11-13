import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RequestLog } from './-components/request-log';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="flex flex-col gap-6">
          <Outlet />
        </main>
        <aside>
          <RequestLog />
        </aside>
      </div>
    </div>
  );
}

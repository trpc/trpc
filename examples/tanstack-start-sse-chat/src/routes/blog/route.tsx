import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

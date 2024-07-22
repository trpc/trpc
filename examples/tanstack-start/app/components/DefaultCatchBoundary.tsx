import {
  ErrorComponent,
  ErrorComponentProps,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router';

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });

  console.error(error);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            router.invalidate();
          }}
          className={`rounded bg-gray-600 px-2 py-1 font-extrabold uppercase text-white dark:bg-gray-700`}
        >
          Try Again
        </button>
        {isRoot ? (
          <Link
            to="/"
            className={`rounded bg-gray-600 px-2 py-1 font-extrabold uppercase text-white dark:bg-gray-700`}
          >
            Home
          </Link>
        ) : (
          <Link
            to="/"
            className={`rounded bg-gray-600 px-2 py-1 font-extrabold uppercase text-white dark:bg-gray-700`}
            onClick={(e) => {
              e.preventDefault();
              window.history.back();
            }}
          >
            Go Back
          </Link>
        )}
      </div>
    </div>
  );
}

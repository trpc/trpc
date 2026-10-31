import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getSession } from '~/server/auth';

const fetchSession = createServerFn().handler(() => getSession(getRequest()));

export function sessionQuery() {
  return queryOptions({
    queryKey: ['session'],
    queryFn: () => fetchSession(),
    // Signing in or out reloads the page
    staleTime: Infinity,
  });
}

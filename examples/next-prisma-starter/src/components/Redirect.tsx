import { useRouter } from 'next/router';
import { ReactNode, useEffect } from 'react';
import { trpc } from '~/utils/trpc';

/**
 * Isomorphic redirect to another page.
 * Optionally takes `children` to display a client-side loading state whilst doing the redirect.
 */
export const Redirect = (props: { pathname: string; children?: ReactNode }) => {
  const router = useRouter();
  const utils = trpc.useContext();

  if (!props.pathname.startsWith('/')) {
    throw new Error(
      `"pathname" needs to be a relative path that starts with "/" - got "${props.pathname}"`,
    );
  }

  // Server-side redirect
  if (utils.ssrContext) {
    // This `_redirectTo` will be picked up in `_app.tsx`'s `responseMeta` function
    utils.ssrContext._redirectTo = props.pathname;
  }

  // Client-side redirect
  useEffect(() => {
    void router.replace(props.pathname);
  }, [router, props.pathname]);

  return <>{props.children}</>;
};

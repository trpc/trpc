'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

function Params() {
  const searchParams = useSearchParams();
  if (!searchParams) return null;

  return searchParams.toString().length !== 0 ? (
    <div className="px-2 text-gray-500">
      <span>?</span>
      {Array.from(searchParams.entries()).map(([key, value], index) => {
        return (
          <React.Fragment key={key}>
            {index !== 0 ? <span>&</span> : null}
            <span className="px-1">
              <span
                key={key}
                className="animate-[highlight_1s_ease-in-out_1] text-gray-100"
              >
                {key}
              </span>
              <span>=</span>
              <span
                key={value}
                className="animate-[highlight_1s_ease-in-out_1] text-gray-100"
              >
                {value}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  ) : null;
}

export function AddressBar() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-x-2 p-3.5 lg:px-5 lg:py-3">
      <div className="text-gray-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <div className="flex flex-1 gap-x-1 text-sm font-medium">
        <Link href="/">
          <span className="px-2 text-gray-400">next-13.trpc.io</span>
        </Link>
        {!!pathname && (
          <>
            <span className="text-gray-600">/</span>
            {pathname
              .split('/')
              .slice(1)
              .map((segment, idx) => {
                return (
                  <React.Fragment key={segment}>
                    <span>
                      <span
                        key={segment}
                        className="animate-[highlight_1s_ease-in-out_1] rounded-full px-1.5 py-0.5 text-gray-100"
                      >
                        {segment}
                      </span>
                    </span>

                    {idx !== pathname.split('/').length - 2 && (
                      <span className="text-gray-600">/</span>
                    )}
                  </React.Fragment>
                );
              })}
          </>
        )}

        <Suspense>
          <Params />
        </Suspense>
      </div>

      <HoverCard openDelay={100}>
        <HoverCardTrigger asChild>
          <Info className="w-5 text-gray-100" />
        </HoverCardTrigger>
        <HoverCardContent align="end" className="w-80 space-y-2">
          <h4 className="text-base font-medium">What is this?</h4>
          <p className="text-sm text-gray-400">
            This is a demo of the new Next.js 13 App router with tRPC.
          </p>
          <p className="text-sm text-gray-400">
            The main product data is fetched and blocks rendering of the page
            until the data has come back. The rest of the data, i.e. the{' '}
            <i>Recommended Products</i> & <i>Reviews</i> are streamed in after
            the page has loaded.
          </p>
          <p className="text-sm text-gray-400">
            This app was initially made by Vercel and has been ported to use
            tRPC. You can visit the original app{' '}
            <a
              href="https://app-dir.vercel.app/streaming/edge/product/1"
              className="underline decoration-dotted underline-offset-2 hover:text-white"
            >
              here
            </a>
            , or view the source{' '}
            <a
              href="https://github.com/vercel/app-playground"
              className="underline decoration-dotted underline-offset-2 hover:text-white"
            >
              here
            </a>
            . The new, modified source code can be found{' '}
            <a
              href="https://github.com/trpc/trpc/tree/next13-experiment/examples/next-13-starter"
              className="underline decoration-dotted underline-offset-2 hover:text-white"
            >
              here
            </a>
            .
          </p>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

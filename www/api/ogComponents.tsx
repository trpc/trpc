import React from 'react';

export const OGDocsComponent = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        fontFamily: 'Inter',
      }}
    >
      <img
        src="https://assets.trpc.io/www/og-pattern-light.svg"
        tw="absolute"
      />
      <div tw="flex items-center justify-between h-full w-full p-16">
        <div tw="flex flex-col items-start">
          <h1 tw="text-6xl text-gray-900">{title}</h1>
          <p tw="text-2xl text-gray-700">{description}</p>
        </div>

        <div tw="flex justify-between">
          <div tw="flex flex-col items-center">
            <img
              tw="h-64 w-64 mb-4"
              src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
              alt=""
            />
            <span tw="text-5xl font-bold">tRPC</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const OGBlogComponent = ({
  title,
  date,
  readingTime,
  img,
  author,
  authorDesc,
}: {
  title: string;
  date: string;
  readingTime: string;
  img: string;
  author: string;
  authorDesc: string;
}) => {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        fontFamily: 'Inter',
      }}
    >
      <img
        src="https://assets.trpc.io/www/og-pattern-light.svg"
        tw="absolute"
      />
      <div tw="flex items-center justify-between h-full w-full p-16">
        <div tw="flex flex-col items-start">
          <h1 tw="text-6xl text-gray-900">{title}</h1>
          <div tw="flex">
            <p>{date}</p>
            <p tw="mx-2">•</p>
            <p>{readingTime} min read</p>
          </div>
          <div tw="flex items-center">
            <img src={img} tw="h-32 w-32 rounded-full" />
            <div tw="flex flex-col ml-4">
              <p tw="my-1" style={{ fontFamily: 'SF Pro Display Bold' }}>
                {author}
              </p>
              <p tw="my-1">{authorDesc}</p>
            </div>
          </div>
        </div>

        <div tw="flex justify-between">
          <div tw="flex flex-col items-center">
            <img
              tw="h-64 w-64 mb-4"
              src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
              alt=""
            />
            <span tw="text-5xl font-bold">tRPC</span>
          </div>
        </div>
      </div>
    </div>
  );
};

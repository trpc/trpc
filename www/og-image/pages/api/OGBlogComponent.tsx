import React from 'react';

export const OGBlogComponent = ({
  title,
  description,
  date,
  readingTime,
  img,
  author,
  authorDesc,
}: {
  title: string;
  description: string;
  date: string;
  readingTime: string;
  img: string;
  author: string;
  authorDesc: string;
}) => {
  return (
    <div tw="bg-zinc-900 h-full w-full text-white bg-cover flex flex-col p-14">
      <img
        src="https://assets.trpc.io/www/og-pattern-dark.svg"
        alt="background"
        tw="absolute"
      />
      <div tw="flex flex-col justify-between w-full h-full">
        <div tw="flex flex-col w-full">
          <div tw="flex justify-between items-center w-full">
            <div tw="flex flex-col">
              <p tw="text-blue-500 text-xl font-semibold">{date}</p>
              <h1 tw="text-6xl font-extrabold">{title}</h1>
            </div>
            <img
              src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
              width="84px"
              height="84px"
              alt="tRPC logo"
            />
          </div>
          <p tw="text-3xl leading-snug font-semibold text-zinc-300">
            {description}
          </p>
          <p tw="text-xl text-blue-500 font-semibold leading-3">
            {readingTime}
          </p>
        </div>
        <div tw="flex items-center">
          <img
            src={img}
            alt="author profile"
            width="75px"
            height="75px"
            tw="mr-6 rounded-xl"
          />
          <div tw="flex flex-col justify-center">
            <p tw="text-2xl leading-[1px]">{author}</p>
            <p tw="text-xl leading-[1px] text-zinc-300">{authorDesc}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

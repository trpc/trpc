/* eslint-disable react/no-unknown-property */
import { ImageResponse } from '@vercel/og';
import { docsParams } from 'utils/zodParams';

export const config = {
  runtime: 'experimental-edge',
};

export default async (req: Request) => {
  const url = new URL(req.url);

  const parsed = docsParams.decodeURL(url);

  if (!parsed.success) {
    return new Response(parsed.error.toString(), { status: 400 });
  }

  const props = parsed.data;

  return new ImageResponse(
    (
      <div tw="bg-zinc-900 h-full w-full text-white bg-cover flex flex-col p-14">
        <img
          src="https://assets.trpc.io/www/og-pattern-dark.svg"
          alt="background"
          tw="absolute"
        />
        <div tw="flex flex-col justify-center items-center w-full h-full">
          <img
            src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
            width="100px"
            height="100px"
            alt="tRPC logo"
          />
          <h1 tw="text-6xl">{props.title}</h1>
          <p tw="text-center text-3xl text-zinc-300">{props.description}</p>
          <p tw="text-blue-500 text-3xl">{props.urlPath}</p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 600,
    },
  );
};

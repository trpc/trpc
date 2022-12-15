/* eslint-disable react/no-unknown-property */
import { ImageResponse } from '@vercel/og';
import { z } from 'zod';

export const config = {
  runtime: 'experimental-edge',
};

export const docsParamsSchema = z.object({
  title: z.string(),
  description: z.string(),
});
const OGDocsComponent = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
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
        <h1 tw="text-6xl">{title}</h1>
        <p tw="text-center text-2xl text-zinc-300">{description}</p>
      </div>
    </div>
  );
};

export default async (req: Request) => {
  const url = new URL(req.url);

  const parsed = docsParamsSchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );

  if (!parsed.success) {
    return new Response(parsed.error.toString(), { status: 400 });
  }

  return new ImageResponse(
    OGDocsComponent({
      title: parsed.data.title,
      description: parsed.data.description,
    }),
    {
      width: 1200,
      height: 600,
    },
  );
};

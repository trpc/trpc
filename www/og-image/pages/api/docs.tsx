/* eslint-disable react/no-unknown-property */
import { ImageResponse } from '@vercel/og';
import { z } from 'zod';

export const config = {
  runtime: 'experimental-edge',
};

const inter = fetch(new URL('../../public/inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

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

export default async (req: Request) => {
  const interData = await inter;

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

      // For some reason this doesn't work
      fonts: [
        {
          name: 'Inter',
          data: interData,
          style: 'normal',
        },
      ],
    },
  );
};

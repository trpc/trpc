/* eslint-disable react/no-unknown-property */
import { ImageResponse } from '@vercel/og';
import { z } from 'zod';

export const config = {
  runtime: 'experimental-edge',
};

const OGBlogComponent = ({
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

const inter = fetch(new URL('../../public/Inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

export const blogParamsSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z
    .string()
    .transform((val) => new Date(val))
    .transform((date) =>
      Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date),
    ),
  readingTime: z.string(),
  authorName: z.string(),
  authorTitle: z.string(),
  authorImg: z.string(),
});

export default async (req: Request) => {
  const interData = await inter;

  const url = new URL(req.url);

  const parsed = blogParamsSchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return new Response(parsed.error.toString(), { status: 400 });
  }

  return new ImageResponse(
    OGBlogComponent({
      title: parsed.data.title,
      description: parsed.data.description,
      author: parsed.data.authorName,
      authorDesc: parsed.data.authorTitle,
      img: parsed.data.authorImg,
      date: parsed.data.date,
      readingTime: parsed.data.readingTime,
    }),
    {
      width: 1200,
      height: 600,
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

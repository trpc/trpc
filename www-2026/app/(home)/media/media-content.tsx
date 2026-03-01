'use client';

function CopyButton({ value }: { value: string }) {
  return (
    <button
      onClick={() => void navigator.clipboard.writeText(value)}
      className="ml-auto mr-4 cursor-pointer hover:text-gray-300"
      title={`Copy "${value}" to clipboard`}
    >
      {value}
    </button>
  );
}

function InfoCard({
  className,
  title,
  value,
}: {
  className: string;
  title: string;
  value: string;
}) {
  return (
    <div
      className={`relative h-28 w-full rounded-lg text-white ${className}`}
    >
      <div className="absolute bottom-0 m-2 flex w-full text-xl">
        <p>{title}</p>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function Asset({
  title,
  description,
  src,
  imgClassName,
}: {
  title: string;
  description: string;
  src: string;
  imgClassName: string;
}) {
  return (
    <div className="relative flex flex-col">
      <img
        className={`grow self-center ${imgClassName}`}
        src={src}
        alt={title}
      />
      <div className="mt-2">
        <p className="w-full font-semibold">{title}</p>
        <p className="text-fd-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function MediaContent() {
  return (
    <main className="container mx-auto px-6 py-12">
      <h1 className="m-4 whitespace-pre-wrap text-center text-2xl font-extrabold leading-tight tracking-tight md:text-3xl lg:text-4xl xl:text-5xl">
        Media Assets
      </h1>

      <div className="sm:flex sm:space-x-4">
        <div className="-space-y-8 sm:w-1/3 lg:w-1/4">
          <InfoCard
            className="z-10 bg-[#398ccb]"
            title="Primary"
            value="#398ccb"
          />
          <InfoCard className="bg-black" title="Font" value="Inter" />
        </div>

        <div className="my-4 grid grid-cols-3 gap-4 sm:mt-0 sm:w-2/3 lg:w-3/4">
          <Asset
            title="Logo"
            description="Please use this in most circumstances."
            src="/img/logo.svg"
            imgClassName="w-20"
          />
          <Asset
            title="Wordmark Logo Light"
            description="Please use this on light backgrounds."
            src="/img/logo-text-black.svg"
            imgClassName="bg-white p-4 rounded-md"
          />
          <Asset
            title="Wordmark Logo Dark"
            description="Please use this on dark backgrounds."
            src="/img/logo-text-white.svg"
            imgClassName="bg-black p-4 rounded-md"
          />
        </div>
      </div>
    </main>
  );
}

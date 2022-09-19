import React from 'react';

export const Preview = () => {
  return (
    <div className="flex justify-center pt-12">
      <figure>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className="border-6 shadow-xl rounded-lg bg-[#111111] border-[#111111] trpcgif trpcgif--v10 trpcgif--portrait"
        >
          <source
            src="https://assets.trpc.io/www/v10/preview-dark.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
        <video
          autoPlay
          loop
          muted
          playsInline
          width="1200px"
          className="border-[20px] shadow-xl rounded-lg bg-[#111111] border-[#111111] trpcgif trpcgif--v10 trpcgif--landscape"
        >
          <source
            src="https://assets.trpc.io/www/v10/v10-dark-landscape.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
        <img
          src="https://assets.trpc.io/www/v9/trpcgif.gif"
          alt="Demo"
          className="trpcgif trpcgif--v9"
        />
        <figcaption className="pt-3 text-sm text-center text-gray-400 transition group-hover:text-gray-900">
          The client above is <strong>not</strong> importing any code from the
          server, only its type declarations.
        </figcaption>
      </figure>
    </div>
  );
};

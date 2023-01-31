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
          className="border-6 shadow-xl rounded-lg bg-[#111111] border-[#111111] md:hidden"
          poster="https://assets.trpc.io/www/v10/preview-dark.png"
        >
          <source
            src="https://assets.trpc.io/www/v10/preview-dark.mp4"
            type="video/mp4"
          />
          You need a browser that supports HTML5 video to view this video.
        </video>
        <a
          href="#try-it-out"
          className="hidden md:block rounded-lg bg-[#111111] border-[#111111] border-[20px] shadow-[0px_-24px_300px_0px_rgba(57,140,203,0.15)] transition hover:shadow-[0px_-24px_150px_0px_rgba(57,140,203,0.3)]"
          title="Click to try it out"
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            width="1200px"
            poster="https://assets.trpc.io/www/v10/v10-dark-landscape.png"
          >
            <source
              src="https://assets.trpc.io/www/v10/v10-dark-landscape.mp4"
              type="video/mp4"
            />
            You need a browser that supports HTML5 video to view this video.
          </video>
        </a>
      </figure>
    </div>
  );
};

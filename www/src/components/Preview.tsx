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
          className="hidden md:block transition active:opacity-90 hover:shadow-lg dark:hover:shadow-primary-darkest hover:shadow-primary hover:shadow-opacity-10 rounded-lg bg-[#111111] border-[#111111] border-[20px]"
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

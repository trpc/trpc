import Layout from '@theme/Layout';
import React from 'react';

const Asset = (props: {
  title: string;
  description: string;
  src: string;
  imgClassName: string;
}) => {
  return (
    <div className="flex flex-col relative">
      <img
        className={`self-center flex-grow ${props.imgClassName}`}
        src={props.src}
      />
      <div className="mt-2">
        <p className="w-full font-semibold">{props.title}</p>
        <p>{props.description}</p>
      </div>
    </div>
  );
};

const InfoCard = (props: {
  className: string;
  title: string;
  value: string;
}) => {
  return (
    <div
      className={`text-white relative w-full h-28 rounded-lg ${props.className}`}
    >
      <div className="absolute bottom-0 m-2 text-xl flex w-full">
        <p>{props.title}</p>
        <button
          onClick={() => navigator.clipboard.writeText(props.value)}
          className="ml-auto mr-4 hover:text-gray-300"
        >
          {props.value}
        </button>
      </div>
    </div>
  );
};
const PressContent = () => {
  return (
    <main className="container px-6 mx-auto">
      <h1 className="m-4 text-2xl font-extrabold leading-tight tracking-tight text-center whitespace-pre-wrap md:text-3xl lg:text-4xl xl:text-5xl">
        Media Assets
      </h1>

      <div className="sm:flex sm:space-x-4">
        <div className="sm:w-1/3 lg:w-1/4 -space-y-8">
          <InfoCard
            className="bg-primary z-10"
            title="Primary"
            value="#398ccb"
          />
          <InfoCard className="bg-black " title="Font" value="SF Pro Display" />
        </div>

        <div className="grid grid-cols-3 gap-4 my-4 sm:mt-0 sm:w-2/3 lg:w-3/4">
          <Asset
            title="Logo"
            description="Please use this in most circumstances."
            src="img/logo.svg"
            imgClassName="w-20"
          />
          <Asset
            title="Wordmark Logo Light"
            description="Please use this on light backgrounds."
            src="img/logo-text-black.svg"
            imgClassName="bg-white p-4 rounded-md"
          />
          <Asset
            title="Wordmark Logo Dark"
            description="Please use this on dark backgrounds."
            src="img/logo-text-white.svg"
            imgClassName="bg-black p-4 rounded-md"
          />
        </div>
      </div>
    </main>
  );
};
const PressPage = () => {
  return (
    <Layout title="Media" description="tRPC media assets">
      <PressContent />
    </Layout>
  );
};
export default PressPage;

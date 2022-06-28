import Image from 'next/image';

interface Props {
  imageSrc: string;
  header: string;
  description: string;
}
export const SpotlightItem = ({ imageSrc, header, description }: Props) => {
  return (
    <div className="text-center">
      <Image src={imageSrc} alt="spotlight item icon" width="64" height="72" />
      <h3 className="mb-3 text-xl font-bold md:text-2xl">{header}</h3>
      <p className="text-gray-500 max-w-[60ch] text-center">{description}</p>
    </div>
  );
};

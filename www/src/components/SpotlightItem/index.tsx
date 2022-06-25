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
      <h3 className="font-bold text-2xl mb-3">{header}</h3>
      <p className="text-gray-500 max-w-[60ch] text-center">{description}</p>
    </div>
  );
};

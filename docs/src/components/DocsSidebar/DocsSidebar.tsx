import { useRouter } from 'next/router';
import { sidebar } from '../../utils/sidebar';
import { SectionItems } from './SectionItems/SectionItems';

export const DocsSidebar = () => {
  const router = useRouter();
  return (
    <ul className="w-full pt-6 pr-6">
      {sidebar.map((section) => (
        <div key={section.name}>
          <h3 className="py-3 text-xs font-bold text-zinc-400">
            {section.name}
          </h3>
          <SectionItems items={section.items} />
        </div>
      ))}
    </ul>
  );
};

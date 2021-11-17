import FeaturePage from 'feature/react-hook-form';
import { meta } from 'feature/react-hook-form/meta';
import { ExamplePage } from 'utils/ExamplePage';
import { z } from 'zod';

// validation schema is used by server
export const validationSchema = z.object({
  title: z.string().min(2),
  text: z.string().min(5),
});

export default function Page() {
  return (
    <>
      <ExamplePage {...meta}>
        <FeaturePage />
      </ExamplePage>
    </>
  );
}

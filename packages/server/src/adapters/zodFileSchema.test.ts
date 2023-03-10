import { z } from 'zod';
import {
  unstable_createZodFileSchema,
  unstable_zodFileSchema as zodFileSchema,
  unstable_zodFileSchemaOptional as zodFileSchemaOptional,
} from './zodFileSchema';

type Input = typeof zodFileSchema['_input'];

type FileListEsque = {
  item(item: number): File | null;
};

test('File', async () => {
  const input: Input = new File([], 'test.png');
  await zodFileSchema.parseAsync(input);
});

test('stream', async () => {
  // covered by other tests
});

test('FileList', async () => {
  const fileListEsque: FileListEsque = {
    item(_item: number) {
      return new File([], 'test.png');
    },
  };

  expect(await zodFileSchema.parseAsync(fileListEsque)).toMatchInlineSnapshot(
    'File {}',
  );
});

test('optional', async () => {
  const fileListEsque: FileListEsque = {
    item() {
      return null;
    },
  };

  expect(
    await zodFileSchemaOptional.parseAsync(undefined),
  ).toMatchInlineSnapshot('undefined');
  expect(
    await zodFileSchemaOptional.parseAsync(fileListEsque),
  ).toMatchInlineSnapshot('undefined');
});

describe('createZodFileSchema', () => {
  test('optional file', async () => {
    const schema = unstable_createZodFileSchema({
      optional: true,
      __context: 'browser',
    });
    const fileListEsque: FileListEsque = {
      item() {
        return null;
      },
    };

    await schema.parseAsync(undefined);
    await schema.parseAsync(fileListEsque);
  });

  test('only accept png', async () => {
    {
      const schema = unstable_createZodFileSchema({
        types: ['image/png'],
      });

      const png: Input = new File([], 'test.png');
      const pngOutput = await schema.parseAsync(png);
      expect(pngOutput).toBeTruthy();

      const jpg: Input = new File([], 'test.jpg');
      const jpgOutput = await schema.safeParseAsync(jpg);
      expect(jpgOutput.success).toBeFalsy();
    }
  });

  test('gotta have at least 1 type', () => {
    unstable_createZodFileSchema({
      // @ts-expect-error should not be empty
      types: [],
    });
  });
});

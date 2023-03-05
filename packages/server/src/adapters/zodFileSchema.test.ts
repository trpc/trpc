import {
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

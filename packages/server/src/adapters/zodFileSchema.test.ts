import { zodFileSchema } from './zodFileSchema';

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

  await zodFileSchema.parseAsync(fileListEsque);
});

test('optional', async () => {
  const optional = zodFileSchema.optional();

  const fileListEsque: FileListEsque = {
    item() {
      return null;
    },
  };
 
  await optional.parseAsync(undefined);
  
  // ❌❌❌❌❌ this fails:
  await optional.parseAsync(fileListEsque);
});

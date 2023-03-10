import { unstable_createZodFileSchema } from './zodFileSchema';

type FileListEsque = {
  item(item: number): File | null;
};

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
      types: ['image/txt'],
    });

    const txt = new File(['hi bob'], 'bob.txt', {
      type: 'text/plain',
    });
    await schema.safeParseAsync(txt);

    const jpg = new File([], 'test.jpg');
    const jpgOutput = await schema.safeParseAsync(jpg);
    expect(jpgOutput.success).toBeFalsy();
    expect(jpgOutput).toMatchInlineSnapshot(`
      Object {
        "error": [ZodError: [
        {
          "code": "custom",
          "message": "Invalid file type: ",
          "path": []
        }
      ]],
        "success": false,
      }
    `);
  }
});

test('gotta have at least 1 type', () => {
  unstable_createZodFileSchema({
    // @ts-expect-error should not be empty
    types: [],
  });
});

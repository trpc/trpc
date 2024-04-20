/* eslint-disable @typescript-eslint/no-restricted-imports */
// @ts-expect-error the type definitions for this package are borked
import { iterateMultipart } from '@trpc/server/src/adapters/content-handlers/vendor-multipart-parser';

const boundary = 'some random boundary';

test('can parse multipart from readable stream', async () => {
  const testPayload = multipartPayload(expectedParts, boundary);

  const files = [];
  for await (const filePart of iterateMultipart(
    stream(testPayload, 3),
    boundary,
  )) {
    files.push(filePart);
  }

  expect(files.length).toBeGreaterThanOrEqual(1);
});

function multipartPayload(
  parts: (typeof expectedParts)[number][],
  boundary: string,
) {
  boundary = '\r\n--' + boundary;
  return (
    boundary +
    '\r\n' +
    parts
      .map((part) => {
        let contentDisposition = `Content-Disposition: form-data; name="${part.name}"`;
        if (part.filename) {
          contentDisposition += `; filename="${part.filename}"`;
        }

        let contentType = '';
        if (part.contentType) {
          contentType = `\r\nContent-Type: ${part.contentType}`;
        }

        return contentDisposition + contentType + '\r\n\r\n' + part.data;
      })
      .join(boundary + '\r\n') +
    boundary +
    '--'
  );
}

const expectedParts = [
  { name: 'a', data: 'form value a' },
  { name: 'b', data: 'file value b', filename: 'b.txt' },
  {
    name: 'c',
    data: 'file value c\r\nhas\r\nsome new \r\n lines',
    filename: 'c.txt',
    contentType: 'text/plain',
  },
];

function stream(payload: string, size: number) {
  let pos = 0;
  return new ReadableStream({
    type: 'bytes',
    pull: (controller) => {
      let end = pos + size;
      if (end > payload.length) {
        end = payload.length;
      }

      controller.enqueue(stringToArray(payload.slice(pos, end)));

      if (end === payload.length) {
        controller.close();
      }

      pos = end;
    },
  });
}

function stringToArray(s: string) {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

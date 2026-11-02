import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import { expect, test } from 'vitest';

interface Sigstore {
  attest(
    payload: Buffer,
    payloadType: string,
    options: {
      fulcioURL: string;
      rekorURL: string;
      identityToken: string;
      timeout: number;
      retry: { retries: number; minTimeout: number };
    },
  ): Promise<{
    verificationMaterial: { tlogEntries: { logIndex: string }[] };
  }>;
}

/**
 * The sigstore that `lerna publish` signs npm provenance with. This resolves
 * the workspace root's `@lerna-lite/publish`, which is the one CI runs.
 */
function loadPublishSigstore(): Sigstore {
  const lernaPublish = fileURLToPath(
    import.meta.resolve('@lerna-lite/publish'),
  );
  const libnpmpublish = createRequire(lernaPublish).resolve('libnpmpublish');
  return createRequire(libnpmpublish)('sigstore') as Sigstore;
}

const ENTRIES_PATH = '/api/v1/log/entries';

/**
 * Fulcio and Rekor on one port. Rekor stores each new entry but never answers
 * the POST that created it, so the client times out and posts the same entry
 * again. That second POST gets the 409 and `Location` header real Rekor sends.
 */
async function startUnresponsiveRekor() {
  const entries = new Map<string, { logIndex: number; body: string }>();

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      if (req.method === 'POST' && req.url === '/api/v2/signingCert') {
        const certificate = `-----BEGIN CERTIFICATE-----\n${Buffer.from('fake').toString('base64')}\n-----END CERTIFICATE-----\n`;
        json(200, {
          signedCertificateEmbeddedSct: {
            chain: { certificates: [certificate] },
          },
        });
        return;
      }

      if (req.method === 'POST' && req.url === ENTRIES_PATH) {
        const uuid = createHash('sha256').update(body).digest('hex');
        if (entries.has(uuid)) {
          res.setHeader('location', `${ENTRIES_PATH}/${uuid}`);
          json(409, {
            code: 409,
            message: `an equivalent entry already exists in the transparency log with UUID ${uuid}`,
          });
          return;
        }
        entries.set(uuid, { logIndex: entries.size + 1, body });
        return;
      }

      const uuid = req.url?.slice(`${ENTRIES_PATH}/`.length) ?? '';
      const entry = entries.get(uuid);
      if (req.method === 'GET' && entry) {
        json(200, {
          [uuid]: {
            body: Buffer.from(entry.body).toString('base64'),
            integratedTime: 0,
            logID: '00'.repeat(32),
            logIndex: entry.logIndex,
          },
        });
        return;
      }

      json(404, { code: 404, message: 'not found' });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return makeAsyncResource(
    { url: `http://127.0.0.1:${port}`, entries },
    async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  );
}

function fakeIdentityToken() {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'none' }),
    encode({
      iss: 'https://token.actions.githubusercontent.com',
      sub: 'repo:trpc/trpc:ref:refs/heads/main',
    }),
    'signature',
  ].join('.');
}

test('provenance signing keeps the Rekor entry a timed-out POST created', async () => {
  await using rekor = await startUnresponsiveRekor();
  const sigstore = loadPublishSigstore();

  const bundle = await sigstore.attest(
    Buffer.from('{}'),
    'application/vnd.in-toto+json',
    {
      fulcioURL: rekor.url,
      rekorURL: rekor.url,
      identityToken: fakeIdentityToken(),
      timeout: 1_000,
      retry: { retries: 2, minTimeout: 10 },
    },
  );

  const [stored, ...others] = rekor.entries.values();
  expect(others).toEqual([]);
  expect(bundle.verificationMaterial.tlogEntries).toEqual([
    expect.objectContaining({
      logIndex: '1',
      canonicalizedBody: Buffer.from(stored!.body).toString('base64'),
    }),
  ]);
});

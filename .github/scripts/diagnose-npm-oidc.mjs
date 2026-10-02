// Read-only probe of the npm trusted-publishing (OIDC) handshake.
//
// Publishes nothing. Every credential it touches — the GitHub ID token and the
// exchanged npm token — is registered as an Actions mask and never printed, so
// this is safe to run on a public repo. Only OIDC claims (public metadata that
// npm matches a trusted publisher on) and non-token response fields are logged.
//
// Must live in a workflow npm's trusted publisher config points at, or the
// token exchange will fail for reasons unrelated to what we're debugging.

const REGISTRY = 'https://registry.npmjs.org';
const PKG = process.argv[2] ?? '@trpc/server';
const ESCAPED = PKG.replace('/', '%2f');

// Claims npm matches a trusted publisher on. Allowlisted so a future GitHub
// change can't start leaking something sensitive into the log.
const SAFE_CLAIMS = [
  'iss',
  'aud',
  'sub',
  'repository',
  'repository_owner',
  'repository_visibility',
  'workflow',
  'workflow_ref',
  'job_workflow_ref',
  'ref',
  'ref_type',
  'environment',
  'event_name',
  'runner_environment',
];

const mask = (secret) => {
  if (secret) console.log(`::add-mask::${secret}`);
};
const section = (title) => console.log(`\n=== ${title} ===`);

const show = async (res) => {
  const text = await res.text();
  console.log(`status: ${res.status} ${res.statusText}`);
  try {
    return JSON.parse(text);
  } catch {
    console.log(`body (not json): ${text.slice(0, 400)}`);
    return null;
  }
};

async function main() {
  section(`1. GitHub OIDC id token for ${PKG}`);
  const { ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN } =
    process.env;
  if (!ACTIONS_ID_TOKEN_REQUEST_URL || !ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    console.log(
      'no id-token request vars — the job is missing `id-token: write`',
    );
    return;
  }

  const idUrl = new URL(ACTIONS_ID_TOKEN_REQUEST_URL);
  idUrl.searchParams.set('audience', `npm:${new URL(REGISTRY).hostname}`);
  const idRes = await fetch(idUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    },
  });
  const idBody = await show(idRes);
  const idToken = idBody?.value;
  mask(idToken);
  if (!idToken) return;

  const claims = JSON.parse(
    Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'),
  );
  console.log('claims npm matches a trusted publisher on:');
  for (const claim of SAFE_CLAIMS) {
    if (claim in claims)
      console.log(`  ${claim}: ${JSON.stringify(claims[claim])}`);
  }

  section('2. npm token exchange');
  const exchangeRes = await fetch(
    `${REGISTRY}/-/npm/v1/oidc/token/exchange/package/${ESCAPED}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    },
  );
  const exchangeBody = await show(exchangeRes);
  const npmToken = exchangeBody?.token;
  mask(npmToken);
  if (exchangeBody) {
    const { token: _token, ...rest } = exchangeBody;
    console.log(`token granted: ${Boolean(npmToken)}`);
    console.log(`other response fields: ${JSON.stringify(rest, null, 2)}`);
  }
  if (!npmToken) {
    console.log('no token to probe with — the exchange is what is failing');
    return;
  }

  const auth = {
    Authorization: `Bearer ${npmToken}`,
    Accept: 'application/json',
  };

  section('3. what the exchanged token can do (reads only)');
  for (const [label, path] of [
    ['whoami', '/-/whoami'],
    ['package visibility', `/-/package/${ESCAPED}/visibility`],
    ['collaborators', `/-/package/${ESCAPED}/collaborators`],
    ['staged versions', '/-/stage'],
  ]) {
    console.log(`\n-- ${label}: GET ${path}`);
    try {
      const body = await show(
        await fetch(`${REGISTRY}${path}`, { headers: auth }),
      );
      if (body) console.log(JSON.stringify(body, null, 2).slice(0, 800));
    } catch (err) {
      console.log(`request failed: ${err.message}`);
    }
  }
}

// Diagnostics should never fail the job — we want the whole log every time.
main().catch((err) => console.log(`probe aborted: ${err.stack}`));

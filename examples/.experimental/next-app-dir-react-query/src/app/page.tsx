import { Suspense } from 'react';
import { MyRawComponent } from './MyRawComponent';
import { MyTRPCComponent } from './MyTRPCComponent';

export default function Page() {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* <RQ /> */}
      <TRPCDynamic />
      <TRPCWithRandomCaches />
    </div>
  );
}

function RQ() {
  return (
    <div style={{ width: 300 }}>
      <h1>Raw React Query Fetch</h1>
      <Suspense fallback={<div>100</div>}>
        <MyRawComponent wait={100} />
      </Suspense>
      <Suspense fallback={<div>200</div>}>
        <MyRawComponent wait={200} />
      </Suspense>
      <Suspense fallback={<div>300</div>}>
        <MyRawComponent wait={300} />

        <Suspense fallback={<div>300</div>}>
          <MyRawComponent wait={600} />
        </Suspense>
      </Suspense>
      <Suspense fallback={<div>400</div>}>
        <MyRawComponent wait={400} />
      </Suspense>
      <Suspense fallback={<div>500</div>}>
        <MyRawComponent wait={500} />
      </Suspense>
      <Suspense fallback={<div>600</div>}>
        <MyRawComponent wait={600} />
      </Suspense>
      <Suspense fallback={<div>700</div>}>
        <MyRawComponent wait={700} />
      </Suspense>

      <fieldset>
        <legend>
          combined <code>Suspense</code>-container
        </legend>
        <Suspense fallback={<div>800</div>}>
          <MyRawComponent wait={800} />
          <MyRawComponent wait={877} />
          <MyRawComponent wait={888} />
          <MyRawComponent wait={899} />
          <MyRawComponent wait={866} />
        </Suspense>
      </fieldset>

      <Suspense fallback={<div>900</div>}>
        <MyRawComponent wait={900} />
      </Suspense>
      <Suspense fallback={<div>1000</div>}>
        <MyRawComponent wait={1000} />
      </Suspense>
    </div>
  );
}

function TRPCDynamic() {
  return (
    <div style={{ width: 300 }}>
      <h1>Dynamic TRPC Fetches</h1>
      <Suspense fallback={<div>100</div>}>
        <MyTRPCComponent wait={100} />
      </Suspense>
      <Suspense fallback={<div>200</div>}>
        <MyTRPCComponent wait={200} />
      </Suspense>
      <Suspense fallback={<div>300</div>}>
        <MyTRPCComponent wait={300} />

        <Suspense fallback={<div>300</div>}>
          <MyTRPCComponent wait={600} />
        </Suspense>
      </Suspense>
      <Suspense fallback={<div>400</div>}>
        <MyTRPCComponent wait={400} />
      </Suspense>
      <Suspense fallback={<div>500</div>}>
        <MyTRPCComponent wait={500} />
      </Suspense>
      <Suspense fallback={<div>600</div>}>
        <MyTRPCComponent wait={600} />
      </Suspense>
      <Suspense fallback={<div>700</div>}>
        <MyTRPCComponent wait={700} />
      </Suspense>

      <fieldset>
        <legend>
          combined <code>Suspense</code>-container
        </legend>
        <Suspense fallback={<div>800</div>}>
          <MyTRPCComponent wait={800} />
          <MyTRPCComponent wait={877} />
          <MyTRPCComponent wait={888} />
          <MyTRPCComponent wait={899} />
          <MyTRPCComponent wait={866} />
        </Suspense>
      </fieldset>

      <Suspense fallback={<div>900</div>}>
        <MyTRPCComponent wait={900} />
      </Suspense>
      <Suspense fallback={<div>1000</div>}>
        <MyTRPCComponent wait={1000} />
      </Suspense>
    </div>
  );
}

function TRPCWithRandomCaches() {
  return (
    <div style={{ width: 300 }}>
      <h1>TRPC Fetches with random caches</h1>
      <Suspense fallback={<div>100</div>}>
        <MyTRPCComponent wait={100} />
      </Suspense>
      <Suspense fallback={<div>200</div>}>
        <MyTRPCComponent wait={200} />
      </Suspense>
      <Suspense fallback={<div>300</div>}>
        <MyTRPCComponent wait={300} />
        <Suspense fallback={<div>600 nested in 300 suspense</div>}>
          <MyTRPCComponent wait={600} />
        </Suspense>
      </Suspense>
      <Suspense fallback={<div>400 (static)</div>}>
        <MyTRPCComponent wait={400} revalidate={false} />
      </Suspense>
      <Suspense fallback={<div>500</div>}>
        <MyTRPCComponent wait={500} />
      </Suspense>
      <Suspense fallback={<div>600 (static)</div>}>
        <MyTRPCComponent wait={600} revalidate={false} />
      </Suspense>
      <Suspense fallback={<div>700</div>}>
        <MyTRPCComponent wait={700} />
      </Suspense>

      <fieldset>
        <legend>
          combined <code>Suspense</code>-container
        </legend>
        <Suspense fallback={<div>800</div>}>
          <MyTRPCComponent wait={800} />
          <MyTRPCComponent wait={877} />
          <MyTRPCComponent wait={888} />
          <MyTRPCComponent wait={899} />
          <MyTRPCComponent wait={866} />
        </Suspense>
      </fieldset>

      <Suspense fallback={<div>900 (revalidated 900ms)</div>}>
        <MyTRPCComponent wait={900} revalidate={900} />
      </Suspense>
      <Suspense fallback={<div>1000</div>}>
        <MyTRPCComponent wait={1000} />
      </Suspense>
    </div>
  );
}

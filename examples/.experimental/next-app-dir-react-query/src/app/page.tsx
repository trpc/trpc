import { Suspense } from 'react';
import { MyRawComponent } from './MyRawComponent';
import { MyTRPCComponent } from './MyTRPCComponent';

export default function Page() {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* <RQ /> */}
      <TRPC />
    </div>
  );
}

function RQ() {
  return (
    <div style={{ width: 500 }}>
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
      <Suspense fallback={<div>800</div>}>
        <MyRawComponent wait={800} />
        <MyRawComponent wait={877} />
        <MyRawComponent wait={888} />
        <MyRawComponent wait={899} />
        <MyRawComponent wait={866} />
      </Suspense>
      <Suspense fallback={<div>900</div>}>
        <MyRawComponent wait={900} />
      </Suspense>
      <Suspense fallback={<div>1000</div>}>
        <MyRawComponent wait={1000} />
      </Suspense>
    </div>
  );
}

function TRPC() {
  return (
    <div>
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
      <Suspense fallback={<div>800</div>}>
        <MyTRPCComponent wait={800} />
        <MyTRPCComponent wait={877} />
        <MyTRPCComponent wait={888} />
        <MyTRPCComponent wait={899} />
        <MyTRPCComponent wait={866} />
      </Suspense>
      <Suspense fallback={<div>900</div>}>
        <MyTRPCComponent wait={900} />
      </Suspense>
      <Suspense fallback={<div>1000</div>}>
        <MyTRPCComponent wait={1000} />
      </Suspense>
    </div>
  );
}

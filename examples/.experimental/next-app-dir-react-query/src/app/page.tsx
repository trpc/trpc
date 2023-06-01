import { Suspense } from 'react';
import { MyComponent } from './MyComponent';

export default function MyPage() {
  return (
    <>
      <Suspense fallback={<div>100</div>}>
        <MyComponent wait={100} />
      </Suspense>
      <Suspense fallback={<div>200</div>}>
        <MyComponent wait={200} />
      </Suspense>
      <Suspense fallback={<div>300</div>}>
        <MyComponent wait={300} />
      </Suspense>
      <Suspense fallback={<div>400</div>}>
        <MyComponent wait={400} />
      </Suspense>
      <Suspense fallback={<div>500</div>}>
        <MyComponent wait={500} />
      </Suspense>
      <Suspense fallback={<div>600</div>}>
        <MyComponent wait={600} />
      </Suspense>
      <Suspense fallback={<div>700</div>}>
        <MyComponent wait={700} />
      </Suspense>
      <Suspense fallback={<div>800</div>}>
        <MyComponent wait={800} />
        <MyComponent wait={877} />
        <MyComponent wait={888} />
        <MyComponent wait={899} />
        <MyComponent wait={866} />
      </Suspense>
      <Suspense fallback={<div>900</div>}>
        <MyComponent wait={900} />
      </Suspense>
      <Suspense fallback={<div>1000</div>}>
        <MyComponent wait={1000} />
      </Suspense>
    </>
  );
}

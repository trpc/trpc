import { ProductCard } from '~/components/product-card';
import { RouterOutputs } from '~/trpc/shared';

type Product = RouterOutputs['products']['byId'];

export async function RecommendedProducts(props: {
  path: string;
  data: Promise<Product[]>;
}) {
  const products = await props.data;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-medium text-white">
          Recommended Products for You
        </div>
        <div className="text-sm text-gray-400">
          Based on your preferences and shopping habits
        </div>
      </div>
      <div className="grid grid-cols-4 gap-6">
        {products.map((product) => (
          <div key={product.id} className="col-span-4 lg:col-span-1">
            {/* @ts-expect-error - Async Server Component */}
            <ProductCard
              product={product}
              href={`${props.path}/${product.id}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecommendedProductsSkeleton() {
  return (
    <div className="space-y-6 pb-[5px]">
      <div>
        <div className="text-lg font-medium text-white">
          Recommended Products for You
        </div>
        <div className="text-sm text-gray-400">
          Based on your preferences and shopping habits
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function ProductSkeleton() {
  const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent`;

  return (
    <div className="col-span-4 space-y-4 lg:col-span-1">
      <div className={`relative h-[200px] rounded-xl bg-gray-900 ${shimmer}`} />
      <div className="h-4 w-full rounded-lg bg-gray-900" />
      <div className="h-6 w-1/3 rounded-lg bg-gray-900" />
      <div className="h-4 w-full rounded-lg bg-gray-900" />
      <div className="h-4 w-4/6 rounded-lg bg-gray-900" />
    </div>
  );
}

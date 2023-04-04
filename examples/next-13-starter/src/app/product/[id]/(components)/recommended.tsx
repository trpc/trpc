import { ProductCard, ProductSkeleton } from '~/components/product-card';
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

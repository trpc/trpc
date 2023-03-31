import { add, formatDistanceToNow } from 'date-fns';
import { type Dinero } from 'dinero.js';
import { ProductDeal } from './product-deal';

export const ProductLighteningDeal = (props: {
  price: Dinero<number>;
  discount: {
    amount: Dinero<number>;
    expires?: number;
  };
}) => {
  const date = add(new Date(), { days: props.discount.expires });

  return (
    <>
      <div className="flex">
        <div className="rounded bg-gray-600 px-1.5 text-xs font-medium leading-5 text-white">
          Expires in {formatDistanceToNow(date)}
        </div>
      </div>

      <ProductDeal price={props.price} discount={props.discount} />
    </>
  );
};

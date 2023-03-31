export const ProductLowStockWarning = (props: { stock: number }) => {
  if (props.stock > 3) {
    return null;
  }

  if (props.stock === 0) {
    return <div className="text-vercel-cyan text-sm">Out of stock</div>;
  }

  return (
    <div className="text-vercel-cyan text-sm">
      Only {props.stock} left in stock
    </div>
  );
};

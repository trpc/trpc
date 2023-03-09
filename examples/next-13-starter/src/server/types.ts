import { type Dinero, DineroSnapshot } from 'dinero.js';

export type Product = {
  id: string;
  stock: number;
  rating: number;
  name: string;
  description: string;
  price: DineroSnapshot<number>;
  isBestSeller: boolean;
  leadTime: number;
  image?: string;
  imageBlur?: string;
  discount?: {
    percent: number;
    expires?: number;
  };
};

export type Review = {
  id: string;
  name: string;
  rating: number;
  text: string;
};

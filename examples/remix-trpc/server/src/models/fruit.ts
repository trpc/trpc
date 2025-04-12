export interface Fruit {
  id: number;
  name: string;
  color: string;
  price: number;
}

// Sample data
export const fruits: Fruit[] = [
  { id: 1, name: 'Apple', color: 'Red', price: 200 },
  { id: 2, name: 'Banana', color: 'Yellow', price: 100 },
  { id: 3, name: 'Grapes', color: 'Purple', price: 300 },
  { id: 4, name: 'Orange', color: 'Orange', price: 150 },
  { id: 5, name: 'Strawberry', color: 'Red', price: 400 }
];

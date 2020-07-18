// export const mapObject = <O extends object, F extends (arg: O[keyof O]) => any>(
//   obj: O,
//   mapper: F,
// ): { [k in keyof O]: ReturnType<F> } => {
//   const newObj: any = {};
//   for (const key in obj) newObj[key] = mapper(obj[key]);
//   return newObj;
// };

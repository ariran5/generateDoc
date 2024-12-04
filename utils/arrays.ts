export function getUniqueElementsReport<T>(array1: T[], array2: T[]) {
  const onlyInArray1 = new Set(array1);
  const onlyInArray2 = new Set(array2);

  // Удаляем из каждого множества элементы, которые есть в другом массиве
  for (const item of array2) {
    onlyInArray1.delete(item);
  }

  for (const item of array1) {
    onlyInArray2.delete(item);
  }

  return {
    onlyInArray1: Array.from(onlyInArray1),
    onlyInArray2: Array.from(onlyInArray2),
  };
}

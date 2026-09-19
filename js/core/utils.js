// Removes the first occurrence of `item` from an array in place (without
// creating a new array) — used everywhere that would otherwise need
// `arr = arr.filter(x => x !== item)`, which doesn't work on an array
// imported from another module (you can't reassign someone else's binding,
// only mutate it).
export function removeItem(arr, item){
  const i = arr.indexOf(item);
  if(i !== -1) arr.splice(i, 1);
  return i !== -1;
}

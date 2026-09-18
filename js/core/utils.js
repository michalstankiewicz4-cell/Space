// Usuwa pierwsze wystąpienie `item` z tablicy w miejscu (bez tworzenia nowej
// tablicy) — używane wszędzie tam, gdzie inaczej trzeba by robić
// `arr = arr.filter(x => x !== item)`, co nie działa na tablicy zaimportowanej
// z innego modułu (nie można podmienić cudzego bindingu, można go tylko mutować).
export function removeItem(arr, item){
  const i = arr.indexOf(item);
  if(i !== -1) arr.splice(i, 1);
  return i !== -1;
}

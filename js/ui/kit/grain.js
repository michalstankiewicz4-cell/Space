// Procedural grain texture for the UI kit's .mat surfaces (see
// css/ui/kit.css): generated once at startup and exposed as the --grain
// CSS var, which every .mat blends in with soft-light.

// Tileable grayscale value noise (vertical streaks + blotches) plus fine
// grain, applied with soft-light over every .mat surface.
function makeGrainTexture(size = 160, seed = 7){
  let st = seed >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  function valueNoise(cellsX, cellsY){
    const g = [];
    for(let i = 0; i < cellsX * cellsY; i++) g.push(rand());
    const at = (x, y) => g[(y % cellsY) * cellsX + (x % cellsX)];
    return (px, py) => {
      const fx = (px / size) * cellsX, fy = (py / size) * cellsY;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  }
  const streaks = valueNoise(4, 20), blotches = valueNoise(5, 5);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  for(let y = 0; y < size; y++){
    for(let x = 0; x < size; x++){
      const n = (streaks(x, y) - 0.5) * 0.8 + (blotches(x, y) - 0.5) * 0.7 + (rand() - 0.5) * 0.22;
      const v = Math.max(0, Math.min(255, 128 + n * 60));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
}

export function applyGrainTexture(){
  document.documentElement.style.setProperty("--grain", `url(${makeGrainTexture()})`);
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type FloorItem = { x: number; y: number; width: number; height: number; rotation: number };
type ResizeOptions = {
  step: number;
  anchoredLeft?: boolean;
  preserveAspectRatio?: boolean;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
};

const directions: Record<ResizeHandle, readonly [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};
const coordinateLimit = 200_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function resizeFloorItem(
  item: FloorItem,
  handle: ResizeHandle,
  delta: { x: number; y: number },
  options: ResizeOptions,
): { x: number; y: number; width: number; height: number } {
  const [horizontal, vertical] = directions[handle];
  const angle = (item.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(angle)) < 1e-12 ? 0 : Math.cos(angle);
  const sine = Math.abs(Math.sin(angle)) < 1e-12 ? 0 : Math.sin(angle);
  const step = Math.max(1, options.step);
  const snap = (value: number) => Math.round(value / step) * step;
  const localX = cosine * delta.x + sine * delta.y;
  const localY = -sine * delta.x + cosine * delta.y;
  let width = horizontal
    ? clamp(item.width + horizontal * snap(localX), options.minWidth, options.maxWidth)
    : item.width;
  let height = vertical
    ? clamp(item.height + vertical * snap(localY), options.minHeight, options.maxHeight)
    : item.height;
  if (options.preserveAspectRatio) {
    const horizontalScale = (horizontal * localX) / item.width;
    const verticalScale = (vertical * localY) / item.height;
    const scaleDelta =
      Math.abs(horizontalScale) >= Math.abs(verticalScale) ? horizontalScale : verticalScale;
    const scale = clamp(
      1 + snap(item.width * scaleDelta) / item.width,
      Math.max(options.minWidth / item.width, options.minHeight / item.height),
      Math.min(options.maxWidth / item.width, options.maxHeight / item.height),
    );
    width = item.width * scale;
    height = item.height * scale;
  }
  const widthDelta = width - item.width;
  const heightDelta = height - item.height;
  const origin = options.anchoredLeft ? 0 : 0.5;

  // Reconstruct the CSS position from the fixed opposite edge and the rotation origin.
  const widthX = cosine * (horizontal / 2 - 0.5 + origin) - origin;
  const heightX = (-sine * vertical) / 2;
  const widthY = sine * (horizontal / 2 - 0.5 + origin);
  const heightY = (cosine * vertical) / 2 - 0.5;
  const movementX = widthX * widthDelta + heightX * heightDelta;
  const movementY = widthY * widthDelta + heightY * heightDelta;
  let progress = 1;
  for (const [coordinate, movement] of [
    [item.x, movementX],
    [item.y, movementY],
  ]) {
    if (movement < 0) progress = Math.min(progress, coordinate / -movement);
    if (movement > 0) progress = Math.min(progress, (coordinateLimit - coordinate) / movement);
  }
  progress = clamp(progress, 0, 1);

  const at = (fraction: number) => {
    const nextWidth = Math.round(item.width + widthDelta * fraction);
    const nextHeight = Math.round(item.height + heightDelta * fraction);
    return {
      x:
        Math.round(
          item.x + widthX * (nextWidth - item.width) + heightX * (nextHeight - item.height),
        ) + 0,
      y:
        Math.round(
          item.y + widthY * (nextWidth - item.width) + heightY * (nextHeight - item.height),
        ) + 0,
      width: nextWidth,
      height: nextHeight,
    };
  };
  const withinBounds = (result: ReturnType<typeof at>) =>
    result.x >= 0 && result.x <= coordinateLimit && result.y >= 0 && result.y <= coordinateLimit;
  let result = at(progress);
  if (!withinBounds(result)) {
    // Rounding both dimensions can cross a boundary by a pixel at oblique angles.
    let lower = 0;
    let upper = progress;
    for (let index = 0; index < 32; index += 1) {
      const middle = (lower + upper) / 2;
      if (withinBounds(at(middle))) lower = middle;
      else upper = middle;
    }
    result = at(lower);
  }
  return result;
}

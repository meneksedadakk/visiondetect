import type { Detection } from "../types/detection";

export type ContainedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function calculateContainedRect(
  containerWidth: number,
  containerHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): ContainedRect {
  const scale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function scaleDetectionBox(
  detection: Detection,
  frameWidth: number,
  frameHeight: number,
  renderedImage: ContainedRect,
) {
  const scaleX = renderedImage.width / frameWidth;
  const scaleY = renderedImage.height / frameHeight;
  return {
    x: renderedImage.x + detection.x1 * scaleX,
    y: renderedImage.y + detection.y1 * scaleY,
    width: (detection.x2 - detection.x1) * scaleX,
    height: (detection.y2 - detection.y1) * scaleY,
  };
}

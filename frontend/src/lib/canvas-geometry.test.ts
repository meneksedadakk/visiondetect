import { describe, expect, it } from "vitest";

import { calculateContainedRect, scaleDetectionBox } from "./canvas-geometry";

describe("canvas geometry", () => {
  it("keeps a 16:9 image centered inside a taller canvas", () => {
    expect(calculateContainedRect(800, 600, 1280, 720)).toEqual({
      x: 0,
      y: 75,
      width: 800,
      height: 450,
    });
  });

  it("scales backend coordinates into the rendered image area", () => {
    const renderedImage = calculateContainedRect(800, 600, 1280, 720);
    const box = scaleDetectionBox(
      {
        class_id: 0,
        class_name: "person",
        confidence: 0.91,
        x1: 128,
        y1: 72,
        x2: 640,
        y2: 360,
      },
      1280,
      720,
      renderedImage,
    );

    expect(box).toEqual({ x: 80, y: 120, width: 320, height: 180 });
  });
});

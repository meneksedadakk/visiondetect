"use client";

import { RefObject, useCallback, useEffect, useRef } from "react";

import {
  calculateContainedRect,
  scaleDetectionBox,
} from "@/lib/canvas-geometry";
import type { DetectionResponse } from "@/types/detection";

type LiveDetectionOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  result: DetectionResponse | null;
};

const BOX_COLORS = ["#6ee7b7", "#fbbf24", "#7dd3fc", "#c4b5fd", "#f9a8d4"];

export function LiveDetectionOverlay({
  videoRef,
  result,
}: LiveDetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container || video.videoWidth === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!result) return;

    const renderedVideo = calculateContainedRect(
      width,
      height,
      video.videoWidth,
      video.videoHeight,
    );

    result.detections.forEach((detection) => {
      const box = scaleDetectionBox(
        detection,
        result.frame_width,
        result.frame_height,
        renderedVideo,
      );
      const color = BOX_COLORS[detection.class_id % BOX_COLORS.length];
      const label = `${detection.class_name} ${Math.round(detection.confidence * 100)}%`;

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(box.x, box.y, box.width, box.height);
      context.font = "600 11px ui-monospace, SFMono-Regular, monospace";
      const labelWidth = context.measureText(label).width + 14;
      const labelY = Math.max(renderedVideo.y, box.y - 24);
      context.fillStyle = color;
      context.fillRect(box.x, labelY, labelWidth, 24);
      context.fillStyle = "#06100d";
      context.fillText(label, box.x + 7, labelY + 16);
    });
  }, [result, videoRef]);

  useEffect(() => {
    draw();
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const observer = new ResizeObserver(draw);
    observer.observe(container);
    video.addEventListener("loadedmetadata", draw);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", draw);
    };
  }, [draw, videoRef]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block size-full"
        aria-label="Canlı detection kutuları"
      />
    </div>
  );
}

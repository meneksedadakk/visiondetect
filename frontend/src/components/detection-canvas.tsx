"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  calculateContainedRect,
  scaleDetectionBox,
} from "@/lib/canvas-geometry";
import type { DetectionResponse } from "@/types/detection";

type DetectionCanvasProps = {
  imageUrl: string;
  result: DetectionResponse | null;
};

const BOX_COLORS = ["#6ee7b7", "#fbbf24", "#7dd3fc", "#c4b5fd", "#f9a8d4"];

export function DetectionCanvas({ imageUrl, result }: DetectionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const image = imageRef.current;
    if (!canvas || !container || !image?.complete || image.naturalWidth === 0) {
      return;
    }

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

    const renderedImage = calculateContainedRect(
      width,
      height,
      image.naturalWidth,
      image.naturalHeight,
    );

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      renderedImage.x,
      renderedImage.y,
      renderedImage.width,
      renderedImage.height,
    );

    if (!result) return;

    result.detections.forEach((detection) => {
      const color = BOX_COLORS[detection.class_id % BOX_COLORS.length];
      const box = scaleDetectionBox(
        detection,
        result.frame_width,
        result.frame_height,
        renderedImage,
      );
      const label = `${detection.class_name} ${Math.round(detection.confidence * 100)}%`;

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(box.x, box.y, box.width, box.height);

      context.font = "600 11px ui-monospace, SFMono-Regular, monospace";
      const labelWidth = context.measureText(label).width + 14;
      const labelY = Math.max(renderedImage.y, box.y - 24);
      context.fillStyle = color;
      context.fillRect(box.x, labelY, labelWidth, 24);
      context.fillStyle = "#06100d";
      context.fillText(label, box.x + 7, labelY + 16);

      const cornerLength = Math.min(14, box.width / 3, box.height / 3);
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(box.x, box.y + cornerLength);
      context.lineTo(box.x, box.y);
      context.lineTo(box.x + cornerLength, box.y);
      context.stroke();
    });
  }, [result]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      draw();
    };
    image.src = imageUrl;
    return () => {
      image.onload = null;
      imageRef.current = null;
    };
  }, [draw, imageUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block size-full"
        role="img"
        aria-label={
          result
            ? `${result.detections.length} nesnenin kutulandığı analiz görseli`
            : "Analiz için seçilen görsel"
        }
      />
    </div>
  );
}

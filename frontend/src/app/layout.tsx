import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VisionGuard — Görsel Analiz",
  description: "Fotoğraf ve canlı kamera için YOLO nesne algılama arayüzü.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

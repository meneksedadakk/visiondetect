import { describe, expect, it } from "vitest";

import { buildStreamUrl, messageFromErrorBody } from "./api";

describe("API error messages", () => {
  it("reads FastAPI string details", () => {
    expect(messageFromErrorBody({ detail: "Dosya çok büyük." })).toBe(
      "Dosya çok büyük.",
    );
  });

  it("adds unsupported class names to validation messages", () => {
    expect(
      messageFromErrorBody({
        detail: {
          message: "Desteklenmeyen nesne sınıfı.",
          unsupported_classes: ["dragon"],
        },
      }),
    ).toBe("Desteklenmeyen nesne sınıfı. (dragon)");
  });
});

describe("WebSocket URL", () => {
  it("encodes confidence and selected classes", () => {
    const url = new URL(buildStreamUrl(0.35, ["person", "traffic light"]));

    expect(url.protocol).toBe("ws:");
    expect(url.pathname).toBe("/api/detections/stream");
    expect(url.searchParams.get("confidence")).toBe("0.35");
    expect(url.searchParams.get("classes")).toBe("person,traffic light");
  });
});

import { describe, expect, it } from "vitest";

import { SingleFrameGate } from "./stream-control";

describe("SingleFrameGate", () => {
  it("blocks a second frame until the first response releases the gate", () => {
    const gate = new SingleFrameGate();

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.isPending).toBe(true);

    gate.release();

    expect(gate.tryAcquire()).toBe(true);
  });
});

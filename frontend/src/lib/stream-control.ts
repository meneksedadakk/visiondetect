/**
 * Ayni anda yalnizca bir frame'in cevap beklemesine izin verir.
 * Bu küçük kapı, inference yavaşladığında WebSocket kuyruğunun büyümesini önler.
 */
export class SingleFrameGate {
  private pending = false;

  get isPending() {
    return this.pending;
  }

  tryAcquire(): boolean {
    if (this.pending) return false;
    this.pending = true;
    return true;
  }

  release(): void {
    this.pending = false;
  }
}

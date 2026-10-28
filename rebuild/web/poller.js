export class Poller {
  constructor(
    run,
    {
      isHidden = () => document.hidden,
      setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
      clearTimer = (id) => globalThis.clearTimeout(id),
      random = Math.random,
    } = {},
  ) {
    Object.assign(this, { run, isHidden, setTimer, clearTimer, random });
    this.failures = 0;
    this.active = false;
    this.timer = null;
    this.running = false;
  }
  start() {
    this.active = true;
    this.schedule(15000);
  }
  stop() {
    this.active = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
  schedule(delay) {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (this.active && !this.isHidden())
      this.timer = this.setTimer(() => this.tick(), delay);
  }
  async tick() {
    if (!this.active || this.isHidden() || this.running) return;
    this.running = true;
    let delay = 15000;
    try {
      await this.run();
      this.failures = 0;
    } catch (error) {
      this.failures++;
      delay =
        Math.max(
          error.retryAfterMs || 0,
          Math.min(300000, 15000 * 2 ** Math.min(this.failures, 5)),
        ) + Math.floor(this.random() * 2000);
    } finally {
      this.running = false;
      this.schedule(delay);
    }
  }
  wake() {
    if (!this.active || this.isHidden()) return;
    this.schedule(0);
  }
}

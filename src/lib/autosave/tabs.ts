// Single-writer guard across browser tabs. Two tabs playing the same save
// would silently overwrite each other, so the newest tab claims ownership: it
// broadcasts `claim`, the current owner flushes its save and goes passive,
// then answers `released` — only then does the new tab load the save, so it
// always starts from the freshest state.

type Msg = { t: "claim" | "released"; from: string };

export class TabGuard {
  readonly tabId = Math.random().toString(36).slice(2, 10);
  private channel: BroadcastChannel | null = null;
  private waiters: (() => void)[] = [];

  constructor(
    userKey: string,
    private onSuperseded: () => void,
  ) {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(`blacknet:tab:${userKey}`);
    this.channel.onmessage = (ev: MessageEvent<Msg>) => {
      const msg = ev.data;
      if (!msg || msg.from === this.tabId) return;
      if (msg.t === "claim") {
        this.onSuperseded();
        this.post("released");
      } else if (msg.t === "released") {
        this.waiters.splice(0).forEach((w) => w());
      }
    };
  }

  private post(t: Msg["t"]): void {
    this.channel?.postMessage({ t, from: this.tabId } satisfies Msg);
  }

  /** Take ownership; resolves once a previous owner released (or after a short timeout). */
  claim(timeoutMs = 300): Promise<void> {
    if (!this.channel) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve();
      }, timeoutMs);
      this.waiters.push(done);
      this.post("claim");
    });
  }

  dispose(): void {
    this.channel?.close();
    this.channel = null;
  }
}

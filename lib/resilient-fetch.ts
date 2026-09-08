const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 1;
const BASE_BACKOFF_MS = 350;

class Semaphore {
  private available: number;
  private readonly queue: Array<(release: () => void) => void> = [];

  constructor(limit: number) {
    this.available = limit;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return this.createRelease();
    }

    return new Promise((resolve) => this.queue.push(resolve));
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next(this.createRelease());
      else this.available += 1;
    };
  }
}

const outboundSemaphore = new Semaphore(5);

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resilientFetch(
  input: string | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const release = await outboundSemaphore.acquire();

  try {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(input, { ...init, signal: controller.signal });
        if (!isRetryableStatus(response.status) || attempt === retries) return response;
        lastError = new Error(`Temporary upstream error: ${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt === retries) throw error;
      } finally {
        clearTimeout(timeout);
      }

      const jitter = Math.floor(Math.random() * 120);
      await wait(BASE_BACKOFF_MS * 2 ** attempt + jitter);
    }

    throw lastError instanceof Error ? lastError : new Error('External request failed');
  } finally {
    release();
  }
}

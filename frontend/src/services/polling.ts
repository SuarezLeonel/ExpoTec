/** Wait after each response, so a slow connection never builds a backlog of refreshes. */
export function startPolling(
  work: () => Promise<unknown>,
  delay: number,
  visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(timer);
    if (!stopped && !visibility.hidden)
      timer = setTimeout(() => {
        void run();
      }, delay);
  }
  async function run() {
    if (stopped || running || visibility.hidden) return;
    running = true;
    try {
      await work();
    } catch {
      /* The next refresh can recover a temporary failure. */
    } finally {
      running = false;
      schedule();
    }
  }
  const changed = () => {
    clearTimeout(timer);
    if (!visibility.hidden) void run();
  };
  visibility.addEventListener('visibilitychange', changed);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    visibility.removeEventListener('visibilitychange', changed);
  };
}

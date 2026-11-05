/**
 * Polling adaptativo con gestión de visibilidad de pestaña.
 *
 * Características:
 * - Secuencial y no acumulativo: espera a que termine la petición previa antes de programar la siguiente.
 * - Eficiente en consumo de recursos: suspende el ciclo cuando la pestaña está oculta (`document.hidden`)
 *   y reanuda inmediatamente al volver al primer plano.
 */

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

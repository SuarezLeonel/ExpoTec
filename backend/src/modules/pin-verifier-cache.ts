import { sha256 } from './security.js';

/** Caches successful expensive checks, never employee identity or authorization. */
export function pinVerifierCache(
  verify: (protectedValue: string, encoded: string) => Promise<boolean>,
  now = () => performance.now(),
  ttl = 5 * 60_000,
  capacity = 256,
) {
  const entries = new Map<string, { expires: number; result: Promise<boolean> }>();
  return (protectedValue: string, encoded: string): Promise<boolean> => {
    const key = sha256(`${protectedValue}\0${encoded}`);
    const existing = entries.get(key);
    if (existing && existing.expires > now()) return existing.result;
    for (const [key, entry] of entries) if (entry.expires <= now()) entries.delete(key);
    if (entries.size >= capacity) entries.delete(entries.keys().next().value!);
    const entry = {
      expires: now() + ttl,
      result: Promise.resolve(false),
    };
    entry.result = Promise.resolve()
      .then(() => verify(protectedValue, encoded))
      .then((valid) => {
        if (valid) entry.expires = now() + ttl;
        else if (entries.get(key) === entry) entries.delete(key);
        return valid;
      })
      .catch((error: unknown) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
    entries.set(key, entry);
    return entry.result;
  };
}

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
const derive = (password: string, salt: string, N: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 }, (error, value) =>
      error ? reject(error) : resolve(value),
    );
  });
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const operationHash = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await derive(password, salt, 131072, 8, 1);
  return `scrypt$131072$8$1$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const pieces = encoded.split('$');
  const [algorithm, n, r, p, currentSalt, currentKey] = pieces;
  const salt = pieces.length === 3 ? pieces[1] : currentSalt;
  const key = pieces.length === 3 ? pieces[2] : currentKey;
  const legacy = pieces.length === 3;
  if (
    algorithm !== 'scrypt' ||
    (!legacy &&
      (pieces.length !== 6 || !['16384', '131072'].includes(n!) || r !== '8' || p !== '1')) ||
    !salt ||
    !/^[a-f0-9]{16,128}$/.test(salt) ||
    !key ||
    !/^[a-f0-9]{128}$/.test(key)
  )
    return false;
  const derived = await derive(password, salt, legacy ? 16384 : Number(n), 8, 1);
  const stored = Buffer.from(key, 'hex');
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

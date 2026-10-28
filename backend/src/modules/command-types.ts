import type { z } from 'zod';
import type { CommandContext } from './types.js';

export type Handler = (ctx: CommandContext, input: unknown) => Promise<unknown>;
export function define<S extends z.ZodType>(
  schema: S,
  handler: (ctx: CommandContext, input: z.infer<S>) => Promise<unknown>,
): Handler {
  return (ctx, input) => handler(ctx, schema.parse(input));
}

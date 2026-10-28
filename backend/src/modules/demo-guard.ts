export function mayResetDemo(databaseUrl: string, demo: boolean, nodeEnv: string): boolean {
  const database = decodeURIComponent(new URL(databaseUrl).pathname);
  return (
    demo && (database === '/baguette_demo' || (nodeEnv === 'test' && database === '/baguette_test'))
  );
}

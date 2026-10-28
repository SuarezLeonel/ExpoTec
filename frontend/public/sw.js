const CACHE = "baguette-shell-__BUILD_ID__";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const shell = await fetch("/", { cache: "reload" });
      if (!shell.ok || !shell.headers.get("content-type")?.includes("text/html"))
        throw new Error("No se pudo guardar la aplicación para usarla sin conexión.");
      const html = await shell.clone().text();
      await cache.put("/", shell);
      const assets = Array.from(
        html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
        (match) => match[1],
      );
      await cache.addAll([
        ...assets,
        "/brand/baguette-logo.svg",
        "/brand/apollo.ttf",
      ]);
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("baguette-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/uploads")
  )
    return;
  const allowed =
    (event.request.mode === "navigate" && ["/", "/gestion", "/carta", "/terminal"].includes(url.pathname)) ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/brand/");
  if (!allowed) return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      const key = event.request.mode === "navigate" ? "/" : url.pathname;
      return (await cache.match(key)) || Response.error();
    }),
  );
});

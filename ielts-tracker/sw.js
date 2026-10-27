// Cache the app shell only. Never cache reports, tokens, database responses or other projects.
const CACHE = "ielts-tracker-shell-v1";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./core.js",
  "./sync.js",
  "./icon.svg",
  "./README.md",
  "./REPORT_FORMAT.md",
  "./report.schema.json",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ielts-tracker-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.hash = ""; // Navigation Requests can retain the hash used for our six local views.
  if (
    url.origin !== self.location.origin ||
    !FILES.some(
      (file) => new URL(file, self.registration.scope).href === url.href,
    )
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// KDTIME 앱(PWA) 서비스 워커
// - 화면(HTML)은 항상 네트워크 먼저: 배포한 새 버전이 바로 보이게. 연결이 없으면 마지막 화면 → 안내 화면.
// - /assets/* (빌드 파일, 이름에 해시가 붙어 바뀌지 않음)는 한 번 받으면 기기에 보관해 빠르게.
// - 학교 자료(Firebase)·외부 주소는 건드리지 않습니다(항상 실시간).
const VERSION = "kdtime-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(SHELL).then(cache => cache.put("/", copy)).catch(() => null);
      return response;
    }).catch(async () => (await caches.match("/")) || caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(ASSETS).then(cache => cache.put(request, copy)).catch(() => null); }
      return response;
    })));
  }
});

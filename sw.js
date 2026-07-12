// ROADCREW 서비스워커 — PWA '앱 설치' 조건 충족용. 캐시 없음(항상 최신).
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch(e){ return; }
  if(url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).catch(function(){
      return new Response('오프라인 상태입니다. 인터넷 연결을 확인해 주세요.', {
        status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}
      });
    })
  );
});

const CACHE_NAME = 'pwa-scanner-v1'
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.webmanifest'
]

// Instalación - Precaching del shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_CACHE_URLS)
    })
  )
  self.skipWaiting()
})

// Activación - Limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    })
  )
  return self.clients.claim()
})

// Estrategia de caché
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Para assets estáticos, usar StaleWhileRevalidate
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone())
            return networkResponse
          })
          return cachedResponse || fetchPromise
        })
      })
    )
    return
  }

  // Para API calls, usar NetworkFirst
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Solo cachear respuestas exitosas
          if (response.status === 200) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Si falla la red, intentar desde cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // Si no hay cache, devolver error genérico
            return new Response(JSON.stringify({ error: 'No connection' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            })
          })
        })
    )
    return
  }

  // Para navegación, usar NetworkFirst
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response
        })
        .catch(() => {
          return caches.match('/')
        })
    )
    return
  }

  // Fallback por defecto
  event.respondWith(fetch(request))
})


const CACHE_NAME = 'pwa-scanner-v1'
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.webmanifest'
]

// Instalación - Precaching del shell
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching static assets')
      return cache.addAll(STATIC_CACHE_URLS).catch(err => {
        console.error('[Service Worker] Error precaching:', err)
      })
    })
  )
  // Forzar activación inmediata
  self.skipWaiting()
})

// Activación - Limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activando...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('[Service Worker] Eliminando cache antiguo:', cacheName)
            return caches.delete(cacheName)
          })
      )
    }).then(() => {
      // Tomar control de todas las páginas inmediatamente
      return self.clients.claim()
    })
  )
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

  // Para API calls, usar NetworkFirst con fallback a cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request, {
        // Agregar timeout para mala señal
        signal: AbortSignal.timeout(10000) // 10 segundos
      })
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
        .catch((error) => {
          console.log('[Service Worker] Red falló, usando cache para:', url.pathname)
          // Si falla la red (timeout, sin conexión, etc), intentar desde cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // Si no hay cache, devolver error pero permitir que la app maneje el error
            return new Response(JSON.stringify({ 
              error: 'No connection',
              offline: true 
            }), {
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


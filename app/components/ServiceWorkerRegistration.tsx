'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
          })
          
          console.log('[PWA] Service Worker registrado:', registration.scope)

          // Detectar actualizaciones del service worker
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Hay una nueva versión disponible
                  console.log('[PWA] Nueva versión disponible')
                  // Opcional: mostrar notificación al usuario
                  if (window.confirm('Hay una nueva versión disponible. ¿Deseas actualizar?')) {
                    newWorker.postMessage({ action: 'skipWaiting' })
                    window.location.reload()
                  }
                }
              })
            }
          })

          // Escuchar mensajes del service worker
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[PWA] Service Worker actualizado, recargando...')
            window.location.reload()
          })
        } catch (error) {
          console.error('[PWA] Error registrando Service Worker:', error)
        }
      }

      // Registrar inmediatamente o cuando la página cargue
      if (document.readyState === 'complete') {
        registerServiceWorker()
      } else {
        window.addEventListener('load', registerServiceWorker)
      }
    }
  }, [])

  return null
}


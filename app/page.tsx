'use client'

import { useState, useEffect } from 'react'
import Login from './components/Login'
import Loading from './components/Loading'
import Scanner from './components/Scanner'
import { useTicketStore } from '@/lib/ticketStore'

type AppState = 'login' | 'loading' | 'scanner'

export default function Home() {
  const [appState, setAppState] = useState<AppState>('login')
  const { getAdminKey, loadSnapshot, syncPendingUses } = useTicketStore()

  useEffect(() => {
    // Verificar si ya hay una clave guardada
    const adminKey = getAdminKey()
    if (adminKey) {
      setAppState('loading')
      initializeApp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initializeApp = async () => {
    try {
      // Cargar snapshot y sincronizar pendientes en paralelo
      await Promise.all([
        loadSnapshot(),
        syncPendingUses()
      ])
      setAppState('scanner')
    } catch (error) {
      console.error('Error initializing app:', error)
      // Si hay error, volver al login
      setAppState('login')
      alert('Error al cargar los datos. Verifica tu conexión y vuelve a ingresar.')
    }
  }

  const handleLoginSuccess = () => {
    setAppState('loading')
    initializeApp()
  }

  if (appState === 'login') {
    return <Login onSuccess={handleLoginSuccess} />
  }

  if (appState === 'loading') {
    return <Loading message="Cargando datos..." />
  }

  return <Scanner />
}


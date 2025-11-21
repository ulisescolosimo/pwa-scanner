'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from './db'
import type { Ticket, PendingUse } from '@/types/ticket'

const ADMIN_KEY_STORAGE = 'admin_key'

export function useTicketStore() {
  const [isLoading, setIsLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)

  const updatePendingCount = useCallback(async () => {
    const count = await db.pendingUses.count()
    setPendingCount(count)
  }, [])

  // Monitorear estado online/offline
  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Actualizar contador de pendientes
  useEffect(() => {
    updatePendingCount()

    const interval = setInterval(() => {
      updatePendingCount()
    }, 5000)

    return () => clearInterval(interval)
  }, [updatePendingCount])

  const getAdminKey = (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ADMIN_KEY_STORAGE)
  }

  const setAdminKey = (key: string) => {
    if (typeof window === 'undefined') return
    localStorage.setItem(ADMIN_KEY_STORAGE, key)
  }

  const clearAdminKey = () => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(ADMIN_KEY_STORAGE)
  }

  const getAuthHeaders = () => {
    const key = getAdminKey()
    if (!key) throw new Error('No admin key')
    return {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  }

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true)
    try {
      const headers = getAuthHeaders()
      const response = await fetch('/api/tickets/snapshot', { headers })

      if (!response.ok) {
        throw new Error(`Failed to load snapshot: ${response.statusText}`)
      }

      const tickets: Ticket[] = await response.json()

      // Limpiar y guardar en IndexedDB
      await db.tickets.clear()
      await db.tickets.bulkAdd(tickets)

      return tickets
    } catch (error) {
      console.error('Error loading snapshot:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const findByIdentifier = useCallback(async (identifier: string): Promise<Ticket | null> => {
    // Buscar primero por qr_code
    let ticket = await db.tickets.where('qr_code').equals(identifier).first()
    
    // Si no se encuentra, intentar por id
    if (!ticket) {
      ticket = await db.tickets.get(identifier)
    }

    return ticket || null
  }, [])

  const markLocallyUsed = useCallback(async (
    ticketId: string,
    scannedBy: string
  ): Promise<void> => {
    const now = new Date().toISOString()

    // Actualizar ticket en IndexedDB
    await db.tickets.update(ticketId, {
      is_used: true,
      used_at: now,
      scanned_by: scannedBy,
      updated_at: now
    })

    // Agregar a cola de sincronización
    await db.pendingUses.put({
      ticketId,
      scannedBy,
      scannedAt: now
    })

    await updatePendingCount()
  }, [updatePendingCount])

  const getPendingUses = useCallback(async (): Promise<PendingUse[]> => {
    return await db.pendingUses.toArray()
  }, [])

  const removePendingUse = useCallback(async (ticketId: string): Promise<void> => {
    await db.pendingUses.delete(ticketId)
    await updatePendingCount()
  }, [updatePendingCount])

  const syncPendingUses = useCallback(async (): Promise<void> => {
    if (!isOnline) {
      console.log('Offline, skipping sync')
      return
    }

    const pending = await getPendingUses()
    if (pending.length === 0) return

    const headers = getAuthHeaders()

    for (const pendingUse of pending) {
      try {
        const response = await fetch('/api/tickets/use', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticketId: pendingUse.ticketId,
            scannedBy: pendingUse.scannedBy,
            scannedAt: pendingUse.scannedAt
          })
        })

        const responseData = await response.json()
        
        if (response.ok) {
          // Éxito - remover de pendientes
          await removePendingUse(pendingUse.ticketId)
          
          // Actualizar ticket local con datos del servidor
          if (responseData.ticket) {
            await db.tickets.update(pendingUse.ticketId, responseData.ticket)
          }
        } else if (response.status === 409) {
          // Ya estaba usado - no es error crítico
          console.warn(`Ticket ${pendingUse.ticketId} already used on server`)
          // Remover de pendientes y actualizar ticket local
          if (responseData.ticket) {
            await db.tickets.update(pendingUse.ticketId, responseData.ticket)
          }
          await removePendingUse(pendingUse.ticketId)
        } else {
          // Error - mantener en cola para reintentar
          console.error(`Failed to sync ticket ${pendingUse.ticketId}:`, response.statusText)
        }
      } catch (error) {
        // Error de red - mantener en cola
        console.error(`Error syncing ticket ${pendingUse.ticketId}:`, error)
      }
    }
  }, [isOnline, getPendingUses, removePendingUse])

  // Sincronización automática
  useEffect(() => {
    if (!isOnline) return

    // Sincronizar inmediatamente al conectarse
    syncPendingUses()

    // Sincronizar periódicamente cada 30 segundos
    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncPendingUses()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [isOnline, syncPendingUses])

  // Escuchar evento online
  useEffect(() => {
    const handleOnline = () => {
      syncPendingUses()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncPendingUses])

  return {
    isLoading,
    pendingCount,
    isOnline,
    getAdminKey,
    setAdminKey,
    clearAdminKey,
    loadSnapshot,
    findByIdentifier,
    markLocallyUsed,
    getPendingUses,
    removePendingUse,
    syncPendingUses
  }
}


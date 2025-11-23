'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useTicketStore } from '@/lib/ticketStore'
import { playSuccessSound } from '@/utils/sound'
import type { Ticket } from '@/types/ticket'
import { toast } from 'sonner'

interface ScanResult {
  ticket: Ticket | null
  status: 'available' | 'used' | 'not_found'
  scannedAt: string
}

interface HistoryItem extends ScanResult {
  qrCode: string
}

const OPERATORS_STORAGE_KEY = 'scanner_operators'
const SELECTED_OPERATOR_KEY = 'selected_operator'

export default function Scanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const qrCodeRegionRef = useRef<HTMLDivElement>(null)
  const isInitializingRef = useRef(false)
  const lastScannedCodeRef = useRef<string>('')
  const lastScanTimeRef = useRef<number>(0)
  const isProcessingRef = useRef<boolean>(false)
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'paused'>('idle')
  const [scannedBy, setScannedBy] = useState('')
  const [operators, setOperators] = useState<string[]>([])
  const [showAddOperator, setShowAddOperator] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState('')
  const [isOperatorDropdownOpen, setIsOperatorDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [manualCode, setManualCode] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [lastScanTime, setLastScanTime] = useState(0)
  const [historySearchTerm, setHistorySearchTerm] = useState('') // Búsqueda en historial
  
  const { findByIdentifier, markLocallyUsed, isOnline, pendingCount, syncPendingUses } = useTicketStore()
  
  // Cargar historial de tickets usados desde IndexedDB
  const loadUsedTicketsHistory = useCallback(async () => {
    try {
      const { db } = await import('@/lib/db')
      // Obtener TODOS los tickets y filtrar los usados manualmente
      // Esto es más confiable que usar el índice ya que puede haber problemas con tipos
      const allTickets = await db.tickets.toArray()
      
      // Filtrar todos los tickets usados (verificar múltiples formatos)
      const usedTickets = allTickets.filter(ticket => {
        const isUsed = ticket.is_used
        // Manejar diferentes formatos: boolean, string, number
        if (typeof isUsed === 'boolean') {
          return isUsed === true
        }
        if (typeof isUsed === 'string') {
          return isUsed === 'true' || isUsed === '1'
        }
        if (typeof isUsed === 'number') {
          return isUsed === 1
        }
        return false
      })
      
      console.log(`Cargando historial: ${usedTickets.length} tickets usados de ${allTickets.length} totales`)
      
      // Convertir todos los tickets usados a HistoryItem
      const historyItems: HistoryItem[] = usedTickets
        .map(ticket => ({
          ticket,
          status: 'used' as const,
          scannedAt: ticket.used_at || ticket.updated_at || ticket.created_at,
          qrCode: ticket.qr_code
        }))
        .sort((a, b) => {
          // Ordenar por fecha de uso, más reciente primero
          const dateA = new Date(a.scannedAt).getTime()
          const dateB = new Date(b.scannedAt).getTime()
          return dateB - dateA
        })
      
      setHistory(historyItems)
    } catch (error) {
      console.error('Error loading used tickets history:', error)
    }
  }, [])
  
  // Cargar historial al iniciar y después de un delay para asegurar que el snapshot se haya completado
  useEffect(() => {
    // Esperar un momento para asegurar que el snapshot se haya completado
    const timer = setTimeout(() => {
      loadUsedTicketsHistory()
    }, 1000) // 1 segundo de delay

    return () => clearTimeout(timer)
  }, [loadUsedTicketsHistory])

  // Recargar historial periódicamente y cuando cambia el estado online
  useEffect(() => {
    if (!isOnline) return

    const interval = setInterval(() => {
      loadUsedTicketsHistory()
    }, 10000) // Recargar cada 10 segundos

    return () => clearInterval(interval)
  }, [isOnline, loadUsedTicketsHistory])
  
  // Recargar historial cuando se sincronizan pendientes
  useEffect(() => {
    if (pendingCount === 0) {
      // Cuando no hay pendientes, recargar historial para asegurar que está actualizado
      loadUsedTicketsHistory()
    }
  }, [pendingCount, loadUsedTicketsHistory])

  const processScan = useCallback(async (qrCode: string) => {
    const now = Date.now()
    
    // Prevenir duplicados usando refs para acceso inmediato
    // Si es el mismo código y fue escaneado hace menos de 2 segundos, ignorar
    if (qrCode === lastScannedCodeRef.current && now - lastScanTimeRef.current < 2000) {
      return // Silenciosamente ignorar, sin mostrar toast
    }
    
    // Si ya se está procesando un escaneo, ignorar nuevos
    if (isProcessingRef.current) {
      return
    }

    // Marcar como procesando y actualizar refs
    isProcessingRef.current = true
    lastScannedCodeRef.current = qrCode
    lastScanTimeRef.current = now
    setLastScanTime(now)

    try {
      // Buscar localmente primero
      let ticket = await findByIdentifier(qrCode)

      // Si no se encuentra localmente y hay conexión, intentar remoto
      if (!ticket && isOnline) {
        try {
          const adminKey = localStorage.getItem('admin_key')
          const response = await fetch('/api/tickets/scan', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminKey}`
            },
            body: JSON.stringify({ mode: 'scan', rawValue: qrCode })
          })

          if (response.ok) {
            const { ticket: remoteTicket } = await response.json()
            ticket = remoteTicket
            // Guardar en IndexedDB para próxima vez
            if (ticket) {
              const { db } = await import('@/lib/db')
              await db.tickets.put(ticket)
            }
          }
        } catch (error) {
          console.error('Error fetching remote ticket:', error)
          // No mostrar toast aquí, se mostrará el de "no encontrado" más abajo
        }
      }

      let status: 'available' | 'used' | 'not_found' = 'not_found'
      let processedTicket: Ticket | null = null

      if (ticket) {
        if (ticket.is_used) {
          status = 'used'
          processedTicket = ticket
          
          // Toast para ticket ya usado
          const usedDate = ticket.used_at 
            ? new Date(ticket.used_at).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'Fecha desconocida'
          toast.warning('⚠️ Ya usado', {
            description: ticket.holder_name,
            duration: 2000, // Más rápido
          })
        } else {
          // Marcar como usado localmente (usar 'Operador' como default si no hay nombre)
          const operatorName = scannedBy.trim() || 'Operador'
          await markLocallyUsed(ticket.id, operatorName)
          
          // Obtener el ticket actualizado después de marcarlo como usado
          const updatedTicket = await findByIdentifier(ticket.qr_code)
          processedTicket = updatedTicket || {
            ...ticket,
            is_used: true,
            used_at: new Date().toISOString(),
            scanned_by: operatorName,
            updated_at: new Date().toISOString()
          }
          
          status = 'available' // 'available' significa que fue marcado como usado exitosamente
          playSuccessSound()
          
          // Toast de éxito - más rápido y compacto
          toast.success('✓ Válido', {
            description: ticket.holder_name,
            duration: 1500, // Más rápido para escaneo rápido
          })
        }
      } else {
        // Toast para ticket no encontrado
        toast.error('❌ No encontrado', {
          duration: 2000, // Más rápido
        })
      }

      const result: ScanResult = {
        ticket: processedTicket,
        status,
        scannedAt: new Date().toISOString()
      }

      // Si se marcó como usado, actualizar el historial completo desde IndexedDB
      if (status === 'available' && processedTicket?.is_used) {
        await loadUsedTicketsHistory()
      } else {
        // Agregar al historial solo si no es un ticket usado (para tickets ya usados que se reescanearon)
        const historyItem: HistoryItem = {
          ...result,
          qrCode
        }
        setHistory(prev => [historyItem, ...prev].slice(0, 50))
      }

      // Intentar sincronizar si se marcó como usado y hay conexión
      if (status === 'available' && processedTicket?.is_used && isOnline) {
        syncPendingUses()
      }
    } catch (error) {
      console.error('Error processing scan:', error)
      toast.error('Error al procesar el escaneo', {
        description: 'Intenta nuevamente',
        duration: 4000,
      })
    } finally {
      // Liberar el lock después de un pequeño delay para evitar escaneos muy rápidos
      setTimeout(() => {
        isProcessingRef.current = false
      }, 500)
    }
  }, [findByIdentifier, markLocallyUsed, isOnline, syncPendingUses, loadUsedTicketsHistory])

  const startCamera = useCallback(async () => {
    // Si ya hay una instancia activa o se está inicializando, no iniciar de nuevo
    if (scannerRef.current || isInitializingRef.current) {
      console.log('Scanner already active or initializing, skipping start')
      return
    }

    // Verificar que el contenedor existe
    const container = qrCodeRegionRef.current
    if (!container) {
      console.log('Container not ready, skipping start')
      return
    }

    isInitializingRef.current = true
    setCameraState('starting')

    try {
      // Limpiar el contenedor completamente antes de iniciar
      // Eliminar todos los elementos hijos, incluyendo videos
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
      container.innerHTML = ''

      // Pequeña pausa para asegurar que el DOM está listo
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verificar nuevamente que no se haya iniciado otra instancia
      // Si scannerRef.current existe, significa que otra instancia ya se inició
      if (scannerRef.current) {
        console.log('Another instance already started, aborting')
        isInitializingRef.current = false
        return
      }

      // Verificar que el contenedor sigue existiendo y está vacío
      if (!qrCodeRegionRef.current || qrCodeRegionRef.current.children.length > 0) {
        console.log('Container not ready or has children, aborting')
        isInitializingRef.current = false
        return
      }

      // Crear nueva instancia usando el ID del contenedor
      const containerId = 'qr-reader'
      const html5QrCode = new Html5Qrcode(containerId)
      
      // Calcular tamaño óptimo del qrbox basado en el viewport
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const qrboxSize = Math.min(
        Math.min(viewportWidth, viewportHeight) * 0.75,
        400
      )

      // Variables locales para prevenir múltiples llamadas del mismo código en el callback
      let lastProcessedCode = ''
      let lastProcessedTime = 0

      await html5QrCode.start(
        { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        {
          fps: 30, // Mayor FPS para mejor detección
          qrbox: { 
            width: qrboxSize, 
            height: qrboxSize 
          },
          aspectRatio: 1.0,
          disableFlip: false, // Permitir flip para mejor detección
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
        },
        (decodedText) => {
          // Prevenir múltiples llamadas del mismo código en el callback
          const now = Date.now()
          if (decodedText === lastProcessedCode && now - lastProcessedTime < 1000) {
            return // Ignorar si es el mismo código en menos de 1 segundo
          }
          lastProcessedCode = decodedText
          lastProcessedTime = now
          processScan(decodedText)
        },
        (errorMessage) => {
          // Ignorar errores de escaneo continuo
        }
      )

      scannerRef.current = html5QrCode
      setCameraState('active')
      isInitializingRef.current = false
    } catch (error) {
      console.error('Error starting camera:', error)
      setCameraState('idle')
      scannerRef.current = null
      isInitializingRef.current = false
      // Limpiar contenedor en caso de error
      if (qrCodeRegionRef.current) {
        qrCodeRegionRef.current.innerHTML = ''
      }
      // Solo mostrar alert si no es un error de cámara ya en uso
      const errorMsg = (error as Error).message || String(error)
      if (!errorMsg.includes('already') && !errorMsg.includes('already started') && !errorMsg.includes('NotFoundError')) {
        toast.error('Error al acceder a la cámara', {
          description: 'Verifica los permisos de la cámara',
        })
      }
    }
  }, [processScan])

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        await scannerRef.current.clear()
      } catch (error) {
        console.error('Error stopping camera:', error)
      } finally {
        // Limpiar el contenedor usando el ref
        if (qrCodeRegionRef.current) {
          qrCodeRegionRef.current.innerHTML = ''
        }
        scannerRef.current = null
        isInitializingRef.current = false
        setCameraState('idle')
      }
    } else {
      // Si no hay instancia pero está marcado como inicializando, resetear
      isInitializingRef.current = false
      // Asegurar que el contenedor esté limpio
      if (qrCodeRegionRef.current) {
        qrCodeRegionRef.current.innerHTML = ''
      }
    }
  }, [])

  const pauseCamera = useCallback(async () => {
    if (scannerRef.current && cameraState === 'active') {
      try {
        await scannerRef.current.pause()
        setCameraState('paused')
      } catch (error) {
        console.error('Error pausing camera:', error)
      }
    }
  }, [cameraState])

  const resumeCamera = useCallback(async () => {
    if (scannerRef.current && cameraState === 'paused') {
      try {
        await scannerRef.current.resume()
        setCameraState('active')
      } catch (error) {
        console.error('Error resuming camera:', error)
      }
    }
  }, [cameraState])


  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      processScan(manualCode.trim())
      setManualCode('')
      setShowManual(false)
    }
  }


  // Cargar operadores y seleccionado desde localStorage
  useEffect(() => {
    const savedOperators = localStorage.getItem(OPERATORS_STORAGE_KEY)
    const savedSelected = localStorage.getItem(SELECTED_OPERATOR_KEY)
    
    if (savedOperators) {
      try {
        const operatorsList = JSON.parse(savedOperators)
        setOperators(operatorsList)
        
        // Si hay un operador guardado, seleccionarlo
        if (savedSelected && operatorsList.includes(savedSelected)) {
          setScannedBy(savedSelected)
        } else if (operatorsList.length > 0) {
          // Si no hay guardado pero hay operadores, seleccionar el primero
          setScannedBy(operatorsList[0])
          localStorage.setItem(SELECTED_OPERATOR_KEY, operatorsList[0])
        }
      } catch (error) {
        console.error('Error loading operators:', error)
      }
    }
  }, [])

  // Guardar operador seleccionado cuando cambia
  useEffect(() => {
    if (scannedBy && operators.includes(scannedBy)) {
      localStorage.setItem(SELECTED_OPERATOR_KEY, scannedBy)
    }
  }, [scannedBy, operators])

  // Guardar lista de operadores cuando cambia
  useEffect(() => {
    if (operators.length > 0) {
      localStorage.setItem(OPERATORS_STORAGE_KEY, JSON.stringify(operators))
    }
  }, [operators])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOperatorDropdownOpen(false)
        setShowAddOperator(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelectOperator = (operator: string) => {
    setScannedBy(operator)
    setIsOperatorDropdownOpen(false)
    setShowAddOperator(false)
  }

  const handleAddNewOperator = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = newOperatorName.trim()
    
    if (trimmedName && !operators.includes(trimmedName)) {
      const updatedOperators = [...operators, trimmedName]
      setOperators(updatedOperators)
      setScannedBy(trimmedName)
      setNewOperatorName('')
      setShowAddOperator(false)
      setIsOperatorDropdownOpen(false)
    } else if (trimmedName && operators.includes(trimmedName)) {
      // Si ya existe, simplemente seleccionarlo
      setScannedBy(trimmedName)
      setNewOperatorName('')
      setShowAddOperator(false)
      setIsOperatorDropdownOpen(false)
    }
  }

  const handleRemoveOperator = (operator: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updatedOperators = operators.filter(op => op !== operator)
    setOperators(updatedOperators)
    
    // Si el operador eliminado era el seleccionado, seleccionar otro o limpiar
    if (scannedBy === operator) {
      if (updatedOperators.length > 0) {
        setScannedBy(updatedOperators[0])
      } else {
        setScannedBy('')
      }
    }
  }

  // Inicializar cámara solo una vez al montar el componente
  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout

    const initCamera = async () => {
      // Verificar múltiples condiciones antes de iniciar
      if (!mounted || scannerRef.current || isInitializingRef.current) {
        return
      }

      // Verificar que el contenedor existe usando el ref
      if (qrCodeRegionRef.current && mounted && !scannerRef.current && !isInitializingRef.current) {
        await startCamera()
      }
    }

    // Delay para asegurar que el DOM está listo
    timeoutId = setTimeout(initCamera, 500)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      // Detener cámara al desmontar
      if (scannerRef.current || isInitializingRef.current) {
        stopCamera()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar una vez al montar

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-200">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-black">Fiesta China</h1>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-black' : 'bg-gray-400'}`} />
            <span className="text-xs text-gray-600">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="px-4 pb-4 pt-4">
        <div className="px-4 pb-4 pt-4">
          <div className="max-w-md mx-auto space-y-3">

            {/* Estado de la cámara - diseño minimalista */}
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${cameraState === 'active' ? 'bg-black animate-pulse' : cameraState === 'paused' ? 'bg-gray-400' : 'bg-gray-300'}`} />
                  <span className="text-sm text-gray-600">
                    <span className="font-medium text-black capitalize">{cameraState === 'active' ? 'Activa' : cameraState === 'paused' ? 'Pausada' : cameraState === 'starting' ? 'Iniciando...' : 'Inactiva'}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  {cameraState === 'active' && (
                    <button
                      onClick={pauseCamera}
                      className="px-4 py-1.5 border border-gray-300 hover:border-black hover:bg-black hover:text-white text-gray-700 rounded-md text-xs font-medium transition-all"
                    >
                      Pausar
                    </button>
                  )}
                  {cameraState === 'paused' && (
                    <button
                      onClick={resumeCamera}
                      className="px-4 py-1.5 bg-black hover:bg-gray-900 text-white rounded-md text-xs font-medium transition-all"
                    >
                      Reanudar
                    </button>
                  )}
                  {cameraState === 'idle' && (
                    <button
                      onClick={startCamera}
                      className="px-4 py-1.5 bg-black hover:bg-gray-900 text-white rounded-md text-xs font-medium transition-all"
                    >
                      Iniciar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Selector de operador */}
            <div className="relative" ref={dropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Operador
          </label>
          <button
            type="button"
            onClick={() => {
              setIsOperatorDropdownOpen(!isOperatorDropdownOpen)
              setShowAddOperator(false)
            }}
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-md text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black flex items-center justify-between transition-colors"
          >
            <span className={scannedBy ? 'text-black' : 'text-gray-500'}>
              {scannedBy || 'Seleccionar operador'}
            </span>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${
                isOperatorDropdownOpen ? 'transform rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Dropdown */}
          {isOperatorDropdownOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
              {operators.length > 0 ? (
                <div className="py-1">
                  {operators.map((operator) => (
                    <div
                      key={operator}
                      onClick={() => handleSelectOperator(operator)}
                      className={`px-4 py-2 cursor-pointer hover:bg-gray-50 flex items-center justify-between transition-colors ${
                        scannedBy === operator ? 'bg-gray-50' : ''
                      }`}
                    >
                      <span className="text-black">{operator}</span>
                      <div className="flex items-center gap-2">
                        {scannedBy === operator && (
                          <svg
                            className="w-4 h-4 text-black"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                        {operators.length > 1 && (
                          <button
                            onClick={(e) => handleRemoveOperator(operator, e)}
                            className="text-gray-600 hover:text-black p-1 transition-colors"
                            title="Eliminar operador"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-2 text-gray-500 text-sm">
                  No hay operadores guardados
                </div>
              )}

              {/* Separador */}
              <div className="border-t border-gray-200" />

              {/* Botón para agregar nuevo */}
              {!showAddOperator ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddOperator(true)
                    setNewOperatorName('')
                  }}
                  className="w-full px-4 py-2 text-left text-black hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Agregar nuevo operador
                </button>
              ) : (
                <form onSubmit={handleAddNewOperator} className="p-2">
                  <input
                    type="text"
                    value={newOperatorName}
                    onChange={(e) => setNewOperatorName(e.target.value)}
                    placeholder="Nombre del operador"
                    autoFocus
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-3 py-1.5 bg-black hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Agregar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddOperator(false)
                        setNewOperatorName('')
                      }}
                      className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-black rounded-md text-sm transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

            {/* Pendientes de sincronizar */}
            {pendingCount > 0 && (
              <div className="bg-gray-50 border border-gray-300 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                  {isOnline && (
                    <button
                      onClick={() => syncPendingUses()}
                      className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Sincronizar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Escáner QR */}
      <div className="mx-auto px-4 pb-4 pt-4">
        <div className="relative">
          <div
            id="qr-reader"
            ref={qrCodeRegionRef}
            className="w-full bg-black rounded-xl overflow-hidden shadow-xl max-h-[65vh]"
            style={{ minHeight: '45vh' }}
          />
          {/* Overlay decorativo minimalista */}
          {cameraState === 'active' && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                <div className="w-32 h-1 bg-white/20 rounded-full"></div>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* Búsqueda manual */}
      <div className="px-4 pb-4">
        <div className="max-w-md mx-auto">
          {!showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="w-full py-3 border border-black hover:bg-black hover:text-white text-black rounded-md font-medium transition-colors"
            >
              Búsqueda Manual
            </button>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ingresa código QR manualmente"
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-md text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-colors"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-black hover:bg-gray-800 text-white rounded-md font-medium transition-colors"
                >
                  Buscar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowManual(false)
                    setManualCode('')
                  }}
                  className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-black rounded-md transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Historial - Siempre visible */}
      <div className="px-4 pb-4">
        <div className="px-4 pb-4">
          <div className="max-w-md mx-auto">
            {/* Título del historial */}
            <div className="mb-3">
              <h2 className="text-base font-semibold text-black mb-3">
                Historial {history.length > 0 && `(${history.length})`}
              </h2>
              
              {/* Buscador */}
              <div className="relative">
                <input
                  type="text"
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  placeholder="Buscar por nombre o apellido..."
                  className="w-full px-4 py-2 pl-10 bg-white border border-gray-300 rounded-md text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-colors text-sm"
                />
                <svg
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {historySearchTerm && (
                  <button
                    onClick={() => setHistorySearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                    title="Limpiar búsqueda"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Lista de historial - sin scroll, todos los items */}
            <div className="space-y-2">
              {(() => {
                // Filtrar historial basado en la búsqueda
                const filteredHistory = historySearchTerm.trim()
                  ? history.filter((item) => {
                      if (!item.ticket?.holder_name) return false
                      const searchLower = historySearchTerm.toLowerCase().trim()
                      const nameLower = item.ticket.holder_name.toLowerCase()
                      // Buscar por nombre completo o por palabras individuales
                      const nameWords = nameLower.split(/\s+/)
                      return nameLower.includes(searchLower) || 
                             nameWords.some(word => word.startsWith(searchLower))
                    })
                  : history

                if (filteredHistory.length > 0) {
                  return filteredHistory.map((item, index) => (
                    <div
                      key={`${item.qrCode}-${item.scannedAt}-${index}`}
                      className="bg-white border border-gray-200 rounded-md p-3 text-sm border-l-4 border-black"
                    >
                      {item.ticket && (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-black font-semibold">{item.ticket.holder_name}</span>
                            <span className="px-2 py-1 rounded text-xs bg-black text-white font-medium">
                              Usado
                            </span>
                          </div>
                          <div className="space-y-1 text-xs text-gray-600">
                            {item.ticket.used_at && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Escaneado:</span>
                                <span className="text-black">
                                  {new Date(item.ticket.used_at).toLocaleString('es-AR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </span>
                              </div>
                            )}
                            {item.ticket.scanned_by && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Por:</span>
                                <span className="text-black">{item.ticket.scanned_by}</span>
                              </div>
                            )}
                            {item.ticket.ticket_type && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500">Tipo:</span>
                                <span className="text-black">{item.ticket.ticket_type}</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))
                } else if (history.length === 0) {
                  return (
                    <div className="bg-white border border-gray-200 rounded-md p-4 text-center text-gray-500 text-sm">
                      No hay tickets escaneados todavía
                    </div>
                  )
                } else {
                  return (
                    <div className="bg-white border border-gray-200 rounded-md p-4 text-center text-gray-500 text-sm">
                      No se encontraron resultados para "{historySearchTerm}"
                    </div>
                  )
                }
              })()}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}


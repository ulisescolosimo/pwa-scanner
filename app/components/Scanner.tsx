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
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'paused'>('idle')
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [flashSupported, setFlashSupported] = useState(false)
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
  const [compactMode, setCompactMode] = useState(true) // Modo compacto para escaneo rápido
  const [showHistory, setShowHistory] = useState(false) // Historial colapsable
  
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

  // Prevenir duplicados (< 2 segundos)
  const isDuplicateScan = useCallback((qrCode: string) => {
    const now = Date.now()
    if (now - lastScanTime < 2000 && history[0]?.qrCode === qrCode) {
      return true
    }
    return false
  }, [lastScanTime, history])

  const processScan = useCallback(async (qrCode: string) => {
    const now = Date.now()
    
    // Prevenir duplicados
    if (isDuplicateScan(qrCode)) {
      toast.info('Escaneo duplicado ignorado', {
        duration: 2000,
      })
      return
    }

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
    }
  }, [findByIdentifier, markLocallyUsed, isOnline, syncPendingUses, isDuplicateScan])

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
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: Math.min(300, window.innerWidth * 0.8), height: Math.min(300, window.innerWidth * 0.8) },
          aspectRatio: 1.0,
          disableFlip: true, // Evitar que se voltee
        },
        (decodedText) => {
          processScan(decodedText)
        },
        (errorMessage) => {
          // Ignorar errores de escaneo continuo
        }
      )

      scannerRef.current = html5QrCode
      setCameraState('active')
      isInitializingRef.current = false

      // Obtener el track de video para controlar el flash
      try {
        // Esperar un momento para que el video se renderice
        await new Promise(resolve => setTimeout(resolve, 300))
        const videoElement = container.querySelector('video')
        if (videoElement && videoElement.srcObject) {
          const stream = videoElement.srcObject as MediaStream
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) {
            videoTrackRef.current = videoTrack
            // Verificar si el flash está soportado
            const capabilities = videoTrack.getCapabilities?.() as any
            if (capabilities?.torch !== undefined) {
              setFlashSupported(true)
            } else {
              setFlashSupported(false)
            }
          }
        }
      } catch (error) {
        console.log('Flash not supported:', error)
        setFlashSupported(false)
      }
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
    // Apagar el flash antes de detener la cámara
    if (flashEnabled && videoTrackRef.current) {
      try {
        await videoTrackRef.current.applyConstraints({ torch: false } as any)
        setFlashEnabled(false)
      } catch (error) {
        console.log('Error turning off flash:', error)
      }
    }

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
        videoTrackRef.current = null
        isInitializingRef.current = false
        setCameraState('idle')
        setFlashEnabled(false)
        setFlashSupported(false)
      }
    } else {
      // Si no hay instancia pero está marcado como inicializando, resetear
      isInitializingRef.current = false
      videoTrackRef.current = null
      setFlashEnabled(false)
      setFlashSupported(false)
      // Asegurar que el contenedor esté limpio
      if (qrCodeRegionRef.current) {
        qrCodeRegionRef.current.innerHTML = ''
      }
    }
  }, [flashEnabled])

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
        
        // Restaurar el estado del flash si estaba encendido
        if (flashEnabled && videoTrackRef.current) {
          try {
            await videoTrackRef.current.applyConstraints({ torch: true } as any)
          } catch (error) {
            console.log('Error restoring flash:', error)
          }
        }
      } catch (error) {
        console.error('Error resuming camera:', error)
      }
    }
  }, [cameraState, flashEnabled])

  const toggleFlash = useCallback(async () => {
    if (!videoTrackRef.current || !flashSupported) {
      toast.error('Flash no disponible', {
        description: 'Tu dispositivo puede no soportar esta función',
      })
      return
    }

    try {
      const newFlashState = !flashEnabled
      await videoTrackRef.current.applyConstraints({ torch: newFlashState } as any)
      setFlashEnabled(newFlashState)
      
      // No mostrar toast para flash, solo feedback visual
    } catch (error) {
      console.error('Error toggling flash:', error)
      toast.error('No se pudo controlar el flash', {
        description: 'Tu dispositivo puede no soportar esta función',
      })
    }
  }, [flashEnabled, flashSupported])

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
    <div className="min-h-screen bg-gray-900">
      {/* Header compacto - solo en modo expandido */}
      {!compactMode && (
        <div className="px-4 pt-4 pb-2">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Fiesta China</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-300">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header minimalista en modo compacto */}
      {compactMode && cameraState === 'active' && (
        <div className="px-4 pt-3 pb-2">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{scannedBy || 'Operador'}</span>
              {pendingCount > 0 && (
                <span className="text-xs bg-yellow-900 text-yellow-200 px-2 py-0.5 rounded">
                  {pendingCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              <button
                onClick={() => setCompactMode(false)}
                className="text-gray-400 hover:text-white p-1"
                title="Mostrar controles"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controles expandidos - solo cuando no está en modo compacto */}
      {!compactMode && (
        <div className="px-4 pb-4">
          <div className="max-w-md mx-auto space-y-3">

            {/* Estado de la cámara */}
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">
                  Cámara: <span className="font-medium text-white capitalize">{cameraState === 'active' ? 'Activa' : cameraState === 'paused' ? 'Pausada' : cameraState === 'starting' ? 'Iniciando...' : 'Inactiva'}</span>
                </span>
                <div className="flex gap-2">
                  {cameraState === 'active' && (
                    <button
                      onClick={pauseCamera}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium"
                    >
                      Pausar
                    </button>
                  )}
                  {cameraState === 'paused' && (
                    <button
                      onClick={resumeCamera}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                    >
                      Reanudar
                    </button>
                  )}
                  {cameraState === 'idle' && (
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                      Iniciar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Selector de operador */}
            <div className="relative" ref={dropdownRef}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Operador
          </label>
          <button
            type="button"
            onClick={() => {
              setIsOperatorDropdownOpen(!isOperatorDropdownOpen)
              setShowAddOperator(false)
            }}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
          >
            <span className={scannedBy ? 'text-white' : 'text-gray-400'}>
              {scannedBy || 'Seleccionar operador'}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
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
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
              {operators.length > 0 ? (
                <div className="py-1">
                  {operators.map((operator) => (
                    <div
                      key={operator}
                      onClick={() => handleSelectOperator(operator)}
                      className={`px-4 py-2 cursor-pointer hover:bg-gray-700 flex items-center justify-between ${
                        scannedBy === operator ? 'bg-gray-700' : ''
                      }`}
                    >
                      <span className="text-white">{operator}</span>
                      <div className="flex items-center gap-2">
                        {scannedBy === operator && (
                          <svg
                            className="w-4 h-4 text-blue-500"
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
                            className="text-red-400 hover:text-red-300 p-1"
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
                <div className="px-4 py-2 text-gray-400 text-sm">
                  No hay operadores guardados
                </div>
              )}

              {/* Separador */}
              <div className="border-t border-gray-700" />

              {/* Botón para agregar nuevo */}
              {!showAddOperator ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddOperator(true)
                    setNewOperatorName('')
                  }}
                  className="w-full px-4 py-2 text-left text-blue-400 hover:bg-gray-700 flex items-center gap-2"
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
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
                    >
                      Agregar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddOperator(false)
                        setNewOperatorName('')
                      }}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
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
              <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-yellow-200">
                    {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                  {isOnline && (
                    <button
                      onClick={() => syncPendingUses()}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium"
                    >
                      Sincronizar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

      {/* Escáner QR - Área más grande */}
      <div className={`mx-auto ${compactMode ? 'px-2' : 'px-4'} ${compactMode ? 'pb-2' : 'pb-4'}`}>
        <div
          id="qr-reader"
          ref={qrCodeRegionRef}
          className={`w-full bg-black ${compactMode ? 'rounded-lg' : 'rounded-xl'} overflow-hidden ${compactMode ? 'max-h-[70vh]' : 'max-h-[60vh]'}`}
          style={{ minHeight: compactMode ? '50vh' : '40vh' }}
        />
      </div>

      {/* Botón flotante de flash - solo cuando la cámara está activa */}
      {cameraState === 'active' && flashSupported && (
        <button
          onClick={toggleFlash}
          className={`fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
            flashEnabled
              ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-2 border-gray-600'
          }`}
          title={flashEnabled ? 'Apagar flash' : 'Encender flash'}
        >
          {flashEnabled ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-18c-3.9 0-7 3.1-7 7 0 2.4 1.2 4.5 3 5.7V19c0 .6.4 1 1 1h6c.6 0 1-.4 1-1v-3.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7zm1 8H11v2h2v-2zm0-4H11v2h2V7z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </button>
      )}

      {/* Botón para cambiar modo - solo cuando la cámara está activa */}
      {cameraState === 'active' && !compactMode && (
        <button
          onClick={() => setCompactMode(true)}
          className="fixed bottom-20 left-4 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center"
          title="Modo rápido"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      )}

      {/* Búsqueda manual - solo en modo expandido */}
      {!compactMode && (
        <div className="px-4 pb-4">
          <div className="max-w-md mx-auto">
            {!showManual ? (
              <button
                onClick={() => setShowManual(true)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium"
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
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                  >
                    Buscar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowManual(false)
                      setManualCode('')
                    }}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Historial - Colapsable */}
      {!compactMode && (
        <div className="px-4 pb-4">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between py-2 px-4 bg-gray-800 rounded-lg hover:bg-gray-700 mb-2"
            >
              <h2 className="text-base font-bold text-white">
                Historial {history.length > 0 && `(${history.length})`}
              </h2>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${showHistory ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showHistory && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
          {history.length > 0 ? (
            history.map((item, index) => (
              <div
                key={`${item.qrCode}-${item.scannedAt}-${index}`}
                className="bg-gray-800 rounded-lg p-3 text-sm border-l-4 border-green-500"
              >
                {item.ticket && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold">{item.ticket.holder_name}</span>
                      <span className="px-2 py-1 rounded text-xs bg-green-900 text-green-200">
                        Usado
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-300">
                      {item.ticket.used_at && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Escaneado:</span>
                          <span className="text-white">
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
                          <span className="text-gray-400">Por:</span>
                          <span className="text-white">{item.ticket.scanned_by}</span>
                        </div>
                      )}
                      {item.ticket.ticket_type && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Tipo:</span>
                          <span className="text-white">{item.ticket.ticket_type}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
              ) : (
                <div className="bg-gray-800 rounded-lg p-4 text-center text-gray-400 text-sm">
                  No hay tickets escaneados todavía
                </div>
              )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}


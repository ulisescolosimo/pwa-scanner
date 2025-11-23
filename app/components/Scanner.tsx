'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useTicketStore } from '@/lib/ticketStore'
import { playSuccessSound } from '@/utils/sound'
import type { Ticket } from '@/types/ticket'
import { toast } from 'sonner'
import ScannerOverlay from './ScannerOverlay'
import HistoryDrawer from './HistoryDrawer'

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

  // UI State
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'paused'>('idle')
  const [scannedBy, setScannedBy] = useState('')
  const [operators, setOperators] = useState<string[]>([])
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [overlayStatus, setOverlayStatus] = useState<'scanning' | 'success' | 'error' | 'used'>('scanning')
  const [overlayMessage, setOverlayMessage] = useState('')
  const [overlaySubMessage, setOverlaySubMessage] = useState('')
  const [showOperatorMenu, setShowOperatorMenu] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState('')

  const { findByIdentifier, markLocallyUsed, isOnline, pendingCount, syncPendingUses } = useTicketStore()

  // Load history
  const loadUsedTicketsHistory = useCallback(async () => {
    try {
      const { db } = await import('@/lib/db')
      const allTickets = await db.tickets.toArray()

      const usedTickets = allTickets.filter(ticket => {
        const isUsed = ticket.is_used
        if (typeof isUsed === 'boolean') return isUsed === true
        if (typeof isUsed === 'string') return isUsed === 'true' || isUsed === '1'
        if (typeof isUsed === 'number') return isUsed === 1
        return false
      })

      const historyItems: HistoryItem[] = usedTickets
        .map(ticket => ({
          ticket,
          status: 'used' as const,
          scannedAt: ticket.used_at || ticket.updated_at || ticket.created_at,
          qrCode: ticket.qr_code
        }))
        .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())

      setHistory(historyItems)
    } catch (error) {
      console.error('Error loading history:', error)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(loadUsedTicketsHistory, 1000)
    return () => clearTimeout(timer)
  }, [loadUsedTicketsHistory])

  useEffect(() => {
    if (!isOnline) return
    const interval = setInterval(loadUsedTicketsHistory, 10000)
    return () => clearInterval(interval)
  }, [isOnline, loadUsedTicketsHistory])

  useEffect(() => {
    if (pendingCount === 0) loadUsedTicketsHistory()
  }, [pendingCount, loadUsedTicketsHistory])

  const triggerHaptic = (type: 'success' | 'error' | 'warning') => {
    if (navigator.vibrate) {
      if (type === 'success') navigator.vibrate([50, 50, 50])
      else if (type === 'error') navigator.vibrate([200, 100, 200])
      else navigator.vibrate([100, 50, 100])
    }
  }

  const processScan = useCallback(async (qrCode: string) => {
    const now = Date.now()
    if (qrCode === lastScannedCodeRef.current && now - lastScanTimeRef.current < 2000) return
    if (isProcessingRef.current) return

    isProcessingRef.current = true
    lastScannedCodeRef.current = qrCode
    lastScanTimeRef.current = now

    try {
      let ticket = await findByIdentifier(qrCode)

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
            if (ticket) {
              const { db } = await import('@/lib/db')
              await db.tickets.put(ticket)
            }
          }
        } catch (error) {
          console.error('Error fetching remote ticket:', error)
        }
      }

      let status: 'available' | 'used' | 'not_found' = 'not_found'
      let processedTicket: Ticket | null = null

      if (ticket) {
        if (ticket.is_used) {
          status = 'used'
          processedTicket = ticket
          setOverlayStatus('used')
          setOverlayMessage('YA USADO')
          setOverlaySubMessage(ticket.holder_name)
          triggerHaptic('warning')
        } else {
          const savedOperator = localStorage.getItem(SELECTED_OPERATOR_KEY)
          const currentOperator = scannedBy.trim()
          const operatorName = (savedOperator || currentOperator || 'Operador').trim()

          if (savedOperator && savedOperator.trim() !== currentOperator) {
            setScannedBy(savedOperator.trim())
          }

          await markLocallyUsed(ticket.id, operatorName)

          const updatedTicket = await findByIdentifier(ticket.qr_code)
          processedTicket = updatedTicket || {
            ...ticket,
            is_used: true,
            used_at: new Date().toISOString(),
            scanned_by: operatorName,
            updated_at: new Date().toISOString()
          }

          status = 'available'
          playSuccessSound()
          setOverlayStatus('success')
          setOverlayMessage('VÁLIDO')
          setOverlaySubMessage(ticket.holder_name)
          triggerHaptic('success')
        }
      } else {
        setOverlayStatus('error')
        setOverlayMessage('NO ENCONTRADO')
        setOverlaySubMessage('')
        triggerHaptic('error')
      }

      // Reset overlay after delay
      setTimeout(() => setOverlayStatus('scanning'), 2000)

      const result: ScanResult = {
        ticket: processedTicket,
        status,
        scannedAt: new Date().toISOString()
      }

      if (status === 'available' && processedTicket?.is_used) {
        await loadUsedTicketsHistory()
        if (isOnline) syncPendingUses()
      } else {
        const historyItem: HistoryItem = { ...result, qrCode }
        setHistory(prev => [historyItem, ...prev].slice(0, 50))
      }

    } catch (error) {
      console.error('Error processing scan:', error)
      toast.error('Error al procesar')
    } finally {
      setTimeout(() => {
        isProcessingRef.current = false
      }, 500)
    }
  }, [findByIdentifier, markLocallyUsed, isOnline, syncPendingUses, loadUsedTicketsHistory, scannedBy])

  const startCamera = useCallback(async () => {
    if (scannerRef.current || isInitializingRef.current || !qrCodeRegionRef.current) return

    isInitializingRef.current = true
    setCameraState('starting')

    try {
      const container = qrCodeRegionRef.current
      container.innerHTML = ''
      await new Promise(resolve => setTimeout(resolve, 200))

      const html5QrCode = new Html5Qrcode('qr-reader')
      const qrboxSize = Math.min(window.innerWidth, window.innerHeight) * 0.75

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 30,
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: window.innerHeight / window.innerWidth,
          disableFlip: false,
        },
        (decodedText) => processScan(decodedText),
        () => { }
      )

      scannerRef.current = html5QrCode
      setCameraState('active')
    } catch (error) {
      console.error('Error starting camera:', error)
      setCameraState('idle')
      toast.error('Error de cámara')
    } finally {
      isInitializingRef.current = false
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
        scannerRef.current = null
        setCameraState('idle')
        if (qrCodeRegionRef.current) qrCodeRegionRef.current.innerHTML = ''
      }
    }
  }, [])

  // Initialize camera
  useEffect(() => {
    let mounted = true
    const init = async () => {
      if (mounted && !scannerRef.current) await startCamera()
    }
    const timer = setTimeout(init, 500)
    return () => {
      mounted = false
      clearTimeout(timer)
      stopCamera()
    }
  }, [startCamera, stopCamera])

  // Load operators
  useEffect(() => {
    const savedOperators = localStorage.getItem(OPERATORS_STORAGE_KEY)
    const savedSelected = localStorage.getItem(SELECTED_OPERATOR_KEY)

    if (savedSelected) setScannedBy(savedSelected)
    if (savedOperators) {
      const list = JSON.parse(savedOperators)
      setOperators(list)
      if (!savedSelected && list.length > 0) {
        setScannedBy(list[0])
        localStorage.setItem(SELECTED_OPERATOR_KEY, list[0])
      }
    }
  }, [])

  const handleOperatorChange = (name: string) => {
    setScannedBy(name)
    localStorage.setItem(SELECTED_OPERATOR_KEY, name)
    setShowOperatorMenu(false)
  }

  const handleAddOperator = (e: React.FormEvent) => {
    e.preventDefault()
    if (newOperatorName.trim()) {
      const updated = [...operators, newOperatorName.trim()]
      setOperators(updated)
      localStorage.setItem(OPERATORS_STORAGE_KEY, JSON.stringify(updated))
      handleOperatorChange(newOperatorName.trim())
      setNewOperatorName('')
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      processScan(manualCode.trim())
      setManualCode('')
      setShowManual(false)
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Camera Layer */}
      <div id="qr-reader" ref={qrCodeRegionRef} className="absolute inset-0 w-full h-full" />

      {/* Overlay Layer */}
      <ScannerOverlay
        status={overlayStatus}
        message={overlayMessage}
        subMessage={overlaySubMessage}
      />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 safe-top">
        <div className="flex justify-between items-start">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-error'}`} />
            <span className="text-xs font-medium text-white/90">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            {pendingCount > 0 && (
              <span className="text-xs text-yellow-500 ml-1">({pendingCount})</span>
            )}
          </div>

          {/* Operator Selector */}
          <div className="relative">
            <button
              onClick={() => setShowOperatorMenu(!showOperatorMenu)}
              className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 active:bg-black/60 transition-colors"
            >
              <span className="text-xs font-medium text-white/90 max-w-[100px] truncate">
                {scannedBy || 'Operador'}
              </span>
              <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showOperatorMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-surface border border-white/10 rounded-xl shadow-xl overflow-hidden animate-fade-in">
                <div className="p-2 space-y-1">
                  {operators.map(op => (
                    <button
                      key={op}
                      onClick={() => handleOperatorChange(op)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${scannedBy === op ? 'bg-primary/20 text-primary' : 'text-white hover:bg-white/5'
                        }`}
                    >
                      {op}
                    </button>
                  ))}
                  <div className="border-t border-white/10 my-1" />
                  <form onSubmit={handleAddOperator} className="flex gap-1">
                    <input
                      type="text"
                      value={newOperatorName}
                      onChange={e => setNewOperatorName(e.target.value)}
                      placeholder="Nuevo..."
                      className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
                    />
                    <button type="submit" className="bg-primary text-white px-2 rounded text-xs">
                      +
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-6 safe-bottom bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex justify-between items-center max-w-md mx-auto w-full">
          <button
            onClick={() => setShowManual(true)}
            className="w-12 h-12 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-full border border-white/10 active:scale-95 transition-all"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-1 bg-white/20 rounded-full mb-1" />
            <span className="text-xs font-medium text-white/70">Historial</span>
          </button>

          <button
            onClick={() => {
              if (cameraState === 'active') {
                scannerRef.current?.pause()
                setCameraState('paused')
              } else {
                scannerRef.current?.resume()
                setCameraState('active')
              }
            }}
            className={`w-12 h-12 flex items-center justify-center backdrop-blur-md rounded-full border border-white/10 active:scale-95 transition-all ${cameraState === 'active' ? 'bg-white/10 text-white' : 'bg-white text-black'
              }`}
          >
            {cameraState === 'active' ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showManual && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Ingreso Manual</h3>
            <form onSubmit={handleManualSubmit}>
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Código del ticket"
                className="w-full bg-surface-light border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowManual(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark"
                >
                  Verificar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        history={history}
        onSearch={() => { }} // Implement search if needed
      />
    </div>
  )
}


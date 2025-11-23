'use client'

import { useEffect, useState } from 'react'
import type { Ticket } from '@/types/ticket'

interface HistoryItem {
    ticket: Ticket | null
    status: 'available' | 'used' | 'not_found'
    scannedAt: string
    qrCode: string
}

interface HistoryDrawerProps {
    isOpen: boolean
    onClose: () => void
    history: HistoryItem[]
    onSearch: (term: string) => void
}

export default function HistoryDrawer({ isOpen, onClose, history, onSearch }: HistoryDrawerProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true)
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value
        setSearchTerm(term)
        onSearch(term)
    }

    // Filtrar solo las escaneadas correctamente (status === 'available' o tickets con scanned_by)
    const validHistory = history.filter(item => {
        if (item.status === 'available') return true
        if (item.ticket && item.ticket.scanned_by && item.status === 'used') return true
        return false
    })

    // Aplicar búsqueda si hay término
    const filteredHistory = searchTerm.trim()
        ? validHistory.filter(item => {
            if (!item.ticket) return false
            return item.ticket.holder_name?.toLowerCase().includes(searchTerm.toLowerCase())
        })
        : validHistory

    if (!isVisible && !isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={`relative w-full bg-surface border-t border-white/10 rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out max-h-[85vh] flex flex-col ${isOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
            >
                {/* Handle */}
                <div className="w-full flex justify-center pt-4 pb-2" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 pb-4 border-b border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-white">Historial</h2>
                        <span className="text-xs font-medium px-2.5 py-1 bg-white/10 rounded-full text-white/60">
                            {filteredHistory.length} scans
                        </span>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={handleSearch}
                            placeholder="Buscar por nombre..."
                            className="w-full bg-surface-light border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                        />
                        <svg className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 safe-pb">
                    {filteredHistory.length > 0 ? (
                        filteredHistory.map((item, index) => (
                            <div
                                key={`${item.qrCode}-${index}`}
                                className="bg-surface-light/50 border border-white/5 rounded-xl p-4 flex items-start gap-4 active:bg-surface-light transition-colors"
                            >
                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-success/20 text-success">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>

                                <div className="flex-1 min-w-0">
                                    {item.ticket && (
                                        <>
                                            <h3 className="text-white font-medium truncate">
                                                {item.ticket.holder_name}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                                <span>{new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                <span>•</span>
                                                <span className="truncate">{item.ticket.ticket_type}</span>
                                            </div>
                                            {item.ticket.scanned_by && (
                                                <div className="mt-1 text-xs text-primary/80">
                                                    Por: {item.ticket.scanned_by}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-gray-500">No hay historial reciente</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

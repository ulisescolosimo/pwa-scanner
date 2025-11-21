export interface Ticket {
  id: string
  order_id: string
  holder_name: string
  holder_email: string
  ticket_type: string
  qr_code: string
  qr_code_url: string
  is_used: boolean
  used_at: string | null
  scanned_by: string | null
  created_at: string
  updated_at: string
}

export interface PendingUse {
  ticketId: string
  scannedBy: string
  scannedAt: string
}


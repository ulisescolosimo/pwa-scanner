import Dexie, { Table } from 'dexie'
import type { Ticket, PendingUse } from '@/types/ticket'

class TicketDatabase extends Dexie {
  tickets!: Table<Ticket>
  pendingUses!: Table<PendingUse>

  constructor() {
    super('TicketDatabase')
    this.version(1).stores({
      tickets: 'id, qr_code, is_used',
      pendingUses: 'ticketId'
    })
  }
}

export const db = new TicketDatabase()


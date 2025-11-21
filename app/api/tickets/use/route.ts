import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/utils/auth"
import { getServiceClient } from "@/utils/supabaseServer"

export async function POST(request: NextRequest) {
  const authError = authorize(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { ticketId, scannedBy, scannedAt } = body

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 })
    }

    const supabase = getServiceClient()

    // Primero obtener el ticket actual
    const { data: currentTicket, error: fetchError } = await supabase
      .from("fiesta_china_individual_tickets")
      .select("*")
      .eq("id", ticketId)
      .single()

    if (fetchError || !currentTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    // Verificar si ya está usado
    if (currentTicket.is_used) {
      return NextResponse.json(
        { ok: false, ticket: currentTicket, error: "Ticket already used" },
        { status: 409 }
      )
    }

    // Actualizar ticket
    const updateData: any = {
      is_used: true,
      used_at: scannedAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (scannedBy) {
      updateData.scanned_by = scannedBy
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from("fiesta_china_individual_tickets")
      .update(updateData)
      .eq("id", ticketId)
      .eq("is_used", false) // Solo actualizar si todavía no está usado
      .select()
      .single()

    if (updateError) {
      // Posible condición de carrera - verificar de nuevo
      const { data: recheck } = await supabase
        .from("fiesta_china_individual_tickets")
        .select("*")
        .eq("id", ticketId)
        .single()

      if (recheck?.is_used) {
        return NextResponse.json(
          { ok: false, ticket: recheck, error: "Ticket already used" },
          { status: 409 }
        )
      }

      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ticket: updatedTicket })
  } catch (error: any) {
    console.error("Error in /api/tickets/use:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/utils/auth"
import { getServiceClient } from "@/utils/supabaseServer"

export async function POST(request: NextRequest) {
  const authError = authorize(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { mode, rawValue, manualCode } = body

    // Modo ping para validar autenticación
    if (mode === "ping") {
      return NextResponse.json({ ok: true })
    }

    // Determinar identificador del QR
    let identifier: string | undefined

    if (manualCode) {
      identifier = manualCode.trim()
    } else if (rawValue) {
      // Intentar parsear como JSON primero
      try {
        const parsed = JSON.parse(rawValue)
        if (parsed.ticket_id) {
          identifier = parsed.ticket_id
        } else if (parsed.qr_code) {
          identifier = parsed.qr_code
        } else {
          identifier = rawValue.trim()
        }
      } catch {
        // Si no es JSON, usar el valor directo
        identifier = rawValue.trim()
      }
    }

    if (!identifier) {
      return NextResponse.json({ error: "No identifier provided" }, { status: 400 })
    }

    // Buscar ticket en Supabase
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from("fiesta_china_individual_tickets")
      .select("*")
      .eq("qr_code", identifier)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, ticket: data })
  } catch (error: any) {
    console.error("Error in /api/tickets/scan:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}


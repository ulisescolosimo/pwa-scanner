import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/utils/auth"
import { getServiceClient } from "@/utils/supabaseServer"

export async function GET(request: NextRequest) {
  const authError = authorize(request)
  if (authError) return authError

  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from("fiesta_china_individual_tickets")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error("Error in /api/tickets/snapshot:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}


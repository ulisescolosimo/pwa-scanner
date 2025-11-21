import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export function authorize(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const adminSecret = process.env.ADMIN_SECRET_KEY

  if (!adminSecret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}


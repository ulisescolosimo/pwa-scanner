import { createClient } from "@supabase/supabase-js"

const REQUIRED_FIELDS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_SECRET_KEY"] as const

function validateEnv() {
  for (const key of REQUIRED_FIELDS) {
    if (!process.env[key]) {
      throw new Error(`Missing env var ${key}`)
    }
  }
}

export function getServiceClient() {
  validateEnv()
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false }
    }
  )
}


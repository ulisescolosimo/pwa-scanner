# Arquitectura de la PWA - Control de Entradas

## Estructura de Carpetas

```
pwa-scanner/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Layout raíz
│   ├── page.tsx                 # Página principal (router interno)
│   ├── globals.css              # Estilos globales
│   ├── api/                     # API Routes
│   │   └── tickets/
│   │       ├── scan/route.ts    # POST /api/tickets/scan
│   │       ├── use/route.ts     # POST /api/tickets/use
│   │       └── snapshot/route.ts # GET /api/tickets/snapshot
│   └── components/              # Componentes React
│       ├── Login.tsx
│       ├── Loading.tsx
│       └── Scanner.tsx
├── utils/                        # Utilidades
│   ├── supabaseServer.ts        # Cliente Supabase server-side
│   ├── auth.ts                  # Helpers de autorización
│   └── sound.ts                 # Web Audio API para beeps
├── lib/                         # Librerías y stores
│   └── ticketStore.ts           # Store IndexedDB + sincronización
├── public/                      # Assets estáticos
│   ├── manifest.webmanifest     # PWA Manifest
│   ├── icons/                   # Iconos PWA
│   └── sw.js                    # Service Worker
├── types/                       # TypeScript types
│   └── ticket.ts                # Tipos de tickets
└── docs/                        # Documentación
    └── architecture.md          # Este archivo
```

## Cómo Organiza la PWA

### Offline-First Strategy

1. **Snapshot inicial**: Al iniciar, se descarga toda la tabla de tickets a IndexedDB
2. **Validación local**: Todos los escaneos se validan contra IndexedDB sin red
3. **Cola de sincronización**: Los usos se guardan localmente y se encolan
4. **Sincronización automática**: Cuando hay conexión, se sincronizan los cambios pendientes

### Flujo de Datos

```
Escaneo QR → Validación Local (IndexedDB) → Marcar como usado localmente
                                                      ↓
                                         Guardar en cola de sincronización
                                                      ↓
                              [Cuando hay Internet] → Sincronizar con Supabase
```

### IndexedDB Schema

**Tabla: tickets**
- id: string
- order_id: string
- holder_name: string
- holder_email: string
- ticket_type: string
- qr_code: string
- qr_code_url: string
- is_used: boolean
- used_at: string | null
- scanned_by: string | null
- created_at: string
- updated_at: string

**Tabla: pendingUses**
- ticketId: string (primary key)
- scannedBy: string
- scannedAt: string

## Rutas API

### POST /api/tickets/scan

**Headers**: `Authorization: Bearer ADMIN_SECRET_KEY`

**Body**:
```json
{
  "mode": "ping" | "scan",
  "rawValue"?: string,
  "manualCode"?: string
}
```

**Respuesta**:
- `mode: "ping"` → `{ ok: true }`
- `mode: "scan"` → `{ ok: true, ticket: {...} }` o `404`

### POST /api/tickets/use

**Headers**: `Authorization: Bearer ADMIN_SECRET_KEY`

**Body**:
```json
{
  "ticketId": string,
  "scannedBy"?: string,
  "scannedAt"?: string
}
```

**Respuesta**:
- Success: `{ ok: true, ticket: {...} }`
- Ya usado: `409 { ok: false, ticket: {...} }`
- No existe: `404`

### GET /api/tickets/snapshot

**Headers**: `Authorization: Bearer ADMIN_SECRET_KEY`

**Respuesta**: Array de todos los tickets
```json
[{ ticket1 }, { ticket2 }, ...]
```

## Flujos de Sincronización

### Inicialización
1. Usuario ingresa admin key
2. Se valida con `/api/tickets/scan?mode=ping`
3. Se descarga snapshot con `/api/tickets/snapshot`
4. Se guarda en IndexedDB
5. Se intenta sincronizar pendientes existentes

### Durante Operación
1. Escaneo detecta QR
2. Se valida en IndexedDB local
3. Si válido y no usado → se marca localmente
4. Se agrega a cola `pendingUses`
5. Se intenta sincronizar inmediatamente si hay conexión

### Sincronización Automática
- Al detectar `window.online`
- Periódicamente cada 30 segundos si `navigator.onLine`
- Manualmente con botón de sincronizar

### Manejo de Conflictos
- Si el ticket ya está usado en servidor (409) → se actualiza localmente pero no se bloquea el escaneo
- Si falla la conexión → se mantiene en cola para reintentar

## PWA Configuration

### Manifest
- `display: standalone`
- `start_url: "/"`
- Theme colors oscuros para uso nocturno
- Icons 192x192 y 512x512

### Service Worker
- Precaching del shell de la app
- Estrategia NetworkFirst para API calls
- Estrategia StaleWhileRevalidate para assets estáticos
- No bloquea sincronización en background

## Variables de Entorno

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
ADMIN_SECRET_KEY=tu-clave-secreta-aqui
```

## Consideraciones de UX

- Botones grandes para uso táctil
- Feedback visual inmediato (beep, animaciones)
- Estado online/offline visible
- Contador de pendientes por sincronizar
- Historial reciente de escaneos
- Prevención de escaneos duplicados (< 2 segundos)


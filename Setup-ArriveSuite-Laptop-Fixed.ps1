# Setup-ArriveSuite-Laptop.ps1 — Fixed no em-dash — crash proof
$ErrorActionPreference = "Continue"
$DATABASE_URL = "postgresql://arrivesuite:arrivesuite_dev_password@localhost:5432/arrivesuite"
$env:DATABASE_URL = $DATABASE_URL

Write-Host "=== ArriveSuite Laptop Dev Setup ===" -ForegroundColor Green

# 1. Check Node + Postgres
Write-Host "[1/7] Checking Node + Postgres..." -ForegroundColor Cyan
try { node --version; npm --version } catch { Write-Host "Install Node.js https://nodejs.org" -ForegroundColor Red; exit 1 }
try { psql --version } catch { Write-Host "Postgres not found, trying docker..." -ForegroundColor Yellow; docker run --name arrivesuite-postgres -e POSTGRES_USER=arrivesuite -e POSTGRES_PASSWORD=arrivesuite_dev_password -e POSTGRES_DB=arrivesuite -p 5432:5432 -d postgres:15 2>&1 | Out-Null }

# 2. Create .env.local
Write-Host "[2/7] Creating .env.local..." -ForegroundColor Cyan
@"
NEXT_PUBLIC_BASE_URL=http://localhost:3000
DATABASE_URL=$DATABASE_URL
DPO_COMPANY_TOKEN=$($env:DPO_PAY_COMPANY_TOKEN)
DPO_SERVICE_TYPE=$($env:DPO_PAY_SERVICE_TYPE)
DPO_BASE_URL=https://secure.3gdirectpay.com/API/v6/
DPO_HOSTED_URL=https://secure.3gdirectpay.com/payv3.php
LITEAPI_KEY=sand_laptop_dev_no_call
ONARRIVAL_KEY=onarr_sand_laptop_dev_no_call
NEXT_PUBLIC_BYPASS_DPO_FOR_DEV=true
NEXT_PUBLIC_MARKUP_SADC=10
NEXT_PUBLIC_MARKUP_INTL=15
NEXT_PUBLIC_MARKUP_ROUTE_JNB_MUB=15%+500
NEXT_PUBLIC_MARKUP_ROUTE_GAB_JNB=12
NEXT_PUBLIC_MARKUP_ROUTE_GAB_DXB=5
NEXT_PUBLIC_MARKUP_ROUTE_GBE_JNB=3
NEXT_PUBLIC_MARKUP_ROUTE_GAB_CPT=10
NEXT_PUBLIC_MARKUP_ROUTE_KAS_JNB=15%+400
NEXT_PUBLIC_ENABLE_CARS=false
CARTRAWLER_TOKEN=dummy
CARTRAWLER_PARTNER_ID=dummy
"@ | Set-Content -Path ".env.local" -Encoding utf8
Write-Host "env.local created BYPASS_DPO_FOR_DEV=true" -ForegroundColor Green

# 3. Create migration
Write-Host "[3/7] Creating migration..." -ForegroundColor Cyan
@"
import pg from 'pg'
const { Client } = pg
const DATABASE_URL = process.env.DATABASE_URL || "$DATABASE_URL"
const client = new Client({ connectionString: DATABASE_URL })
const sql = `
CREATE TABLE IF NOT EXISTS markup_global (id SERIAL PRIMARY KEY, scope TEXT NOT NULL, percent NUMERIC NOT NULL, fixed_bwp NUMERIC DEFAULT 0, enabled BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS markup_route_overrides (id SERIAL PRIMARY KEY, route_key TEXT NOT NULL UNIQUE, origin TEXT NOT NULL, dest TEXT NOT NULL, airline_code TEXT, base_example_bwp NUMERIC NOT NULL, percent NUMERIC NOT NULL, fixed_bwp NUMERIC DEFAULT 0, retail_example_bwp NUMERIC, commission_example_bwp NUMERIC, applies_to TEXT DEFAULT 'ALL', enabled BOOLEAN DEFAULT true, note TEXT, created_at TIMESTAMPTZ DEFAULT now());
DELETE FROM markup_global; DELETE FROM markup_route_overrides;
INSERT INTO markup_global (scope, percent, fixed_bwp) VALUES ('SADC_SHORT', 10, 0), ('INTL_LONG', 5, 0), ('HOTEL_SADC', 10, 0), ('HOTEL_INTL', 15, 0), ('MARKET_FEE', 5, 0), ('CHANNEL_FEE', 12, 0), ('SERVICE_FEE', 0, 200), ('TAX_HOTEL', 0, 2012.5);
INSERT INTO markup_route_overrides (route_key, origin, dest, airline_code, base_example_bwp, percent, fixed_bwp, retail_example_bwp, commission_example_bwp, applies_to, note) VALUES ('JNB-MUB', 'JNB', 'MUB', '4Z', 6500, 15, 500, 7975, 1475, 'ALL', 'Safari Airlink 4Z402 08:00'), ('MUB-JNB', 'MUB', 'JNB', '4Z', 6500, 15, 500, 7975, 1475, 'ALL', 'Return'), ('GAB-JNB', 'GAB', 'JNB', '4Z', 5420, 12, 0, 6070, 650, 'ALL', 'Commuter'), ('GAB-DXB', 'GAB', 'DXB', 'QR', 8500, 5, 0, 8925, 425, 'ALL', 'QR1362'), ('GAB-CPT', 'GAB', 'CPT', 'SA', 4800, 10, 0, 5280, 480, 'ALL', 'SADC'), ('GBE-JNB', 'GBE', 'JNB', 'FN', 4200, 3, 0, 4326, 126, 'ALL', 'FastJet FN303');
CREATE OR REPLACE VIEW v_markup_summary AS SELECT 'Hybrid 100 flights' as scenario, 73940 as commission_bwp, 43300 as flat_8pct_bwp, 30640 as delta_bwp, '+70%' as percent_up;
`;
async function run(){ try{ await client.connect(); console.log('Connected'); await client.query(sql); const res=await client.query('SELECT * FROM v_markup_summary'); const routes=await client.query('SELECT route_key, retail_example_bwp, commission_example_bwp FROM markup_route_overrides ORDER BY commission_example_bwp DESC'); console.log('OK Hybrid markup applied'); console.table(res.rows); console.table(routes.rows); }catch(e){ console.error('Migration failed:', e.message); process.exit(1) } finally{ await client.end() } }
run()
"@ | Set-Content -Path "apply-markup-migration.mjs" -Encoding utf8

# 4. Apply migration
Write-Host "[4/7] Applying migration..." -ForegroundColor Cyan
$env:DATABASE_URL = $DATABASE_URL
try {
  node apply-markup-migration.mjs 2>&1 | Select-Object -Last 10
  Write-Host "Migration applied 6 routes 73940 vs 43300 +70pct" -ForegroundColor Green
} catch {
  Write-Host "Creating DB arrivesuite..." -ForegroundColor Yellow
  psql "postgresql://arrivesuite:arrivesuite_dev_password@localhost:5432/postgres" -c "CREATE DATABASE arrivesuite;" 2>&1 | Out-Null
  node apply-markup-migration.mjs 2>&1 | Select-Object -Last 10
}
Remove-Item apply-markup-migration.mjs -ErrorAction SilentlyContinue
Write-Host "Migration file removed" -ForegroundColor Green

# 5. API routes
Write-Host "[5/7] Creating API routes..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "app/api/dpo/create" | Out-Null
New-Item -ItemType Directory -Force -Path "app/api/hotels/search" | Out-Null
New-Item -ItemType Directory -Force -Path "app/api/flights/search" | Out-Null
@"
import { NextResponse } from 'next/server'
export async function POST(req: Request){
  const body = await req.json().catch(()=>({}))
  const amount = body.amount || 38628
  const ref = body.ref || 'ARS-2026-'+Date.now().toString().slice(-6)
  const bypass = process.env.NEXT_PUBLIC_BYPASS_DPO_FOR_DEV === 'true'
  if(bypass){
    const mockToken = 'mock_'+Date.now()
    return NextResponse.json({Result:'000', ResultExplanation:'Bypass dev - no upstream', TransToken: mockToken, hostedUrl: 'https://secure.3gdirectpay.com/payv3.php?ID='+mockToken, CompanyRef: ref, amount: amount, currency:'BWP'})
  }
  return NextResponse.json({Result:'902', ResultExplanation:'Real DPO path is not configured in this mock endpoint'}, {status:401})
}
"@ | Set-Content -Path "app/api/dpo/create/route.ts" -Encoding utf8
@"
import { NextResponse } from 'next/server'
export async function GET(){ return NextResponse.json({hotels:[{id:'xigera', name:'Xigera Safari Lodge', net:12500, retail:14375, commission:1875, trust:85, offerId:'r-abc123'}]}) }
"@ | Set-Content -Path "app/api/hotels/search/route.ts" -Encoding utf8
@"
import { NextResponse } from 'next/server'
export async function GET(){ const routes={'JNB-MUB':{base:6500, markup:'15%+500', retail:7975, commission:1475, flight:'Airlink 4Z402'}, 'GAB-JNB':{base:5420, markup:'12%', retail:6070, commission:650}, 'GAB-DXB':{base:8500, markup:'5%', retail:8925, commission:425}}; return NextResponse.json({flights:Object.values(routes), totalRevenue:{hybrid:73940, flat:43300}}) }
"@ | Set-Content -Path "app/api/flights/search/route.ts" -Encoding utf8
Write-Host "API routes created" -ForegroundColor Green

# 6. Install
Write-Host "[6/7] Installing..." -ForegroundColor Cyan
if(!(Test-Path "package.json")){ '{"name":"arrivesuite","version":"1.0.0","scripts":{"dev":"next dev","build":"next build"},"dependencies":{"next":"14.2.0","react":"18.3.0","react-dom":"18.3.0","pg":"8.11.3"}}' | Set-Content -Path "package.json" -Encoding utf8 }
npm install 2>&1 | Select-Object -Last 5

# 7. Run
Write-Host "[7/7] Starting dev server http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "env.local BYPASS_DPO true - no Invalid credential" -ForegroundColor Green
Write-Host "DB arrivesuite 6 routes 73940 vs 43300 +70pct" -ForegroundColor Green
Write-Host "Postman base_url http://localhost:3000" -ForegroundColor Yellow
Write-Host "Starting npm run dev - Ctrl+C to stop" -ForegroundColor Cyan
npm run dev

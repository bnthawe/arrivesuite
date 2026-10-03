$ErrorActionPreference = "Continue"
Write-Host "Verifying ArriveSuite environment..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Docker containers:" -ForegroundColor Yellow
docker compose -f infra/docker-compose.yml ps
Write-Host ""
Write-Host "Postgres + PostGIS:" -ForegroundColor Yellow
docker compose -f infra/docker-compose.yml exec -T postgres psql -U arrivesuite -d arrivesuite -c "SELECT PostGIS_Version();"
Write-Host ""
Write-Host "Redis:" -ForegroundColor Yellow
docker compose -f infra/docker-compose.yml exec -T redis redis-cli ping
Write-Host ""
Write-Host "MinIO:" -ForegroundColor Yellow
try {
  Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -UseBasicParsing -TimeoutSec 5 | Out-Null
  Write-Host "MinIO healthy" -ForegroundColor Green
} catch {
  Write-Host "MinIO check failed" -ForegroundColor Red
}
Write-Host ""
Write-Host "MailHog:" -ForegroundColor Yellow
try {
  Invoke-WebRequest -Uri "http://localhost:8025/api/v2/messages" -UseBasicParsing -TimeoutSec 5 | Out-Null
  Write-Host "MailHog healthy" -ForegroundColor Green
} catch {
  Write-Host "MailHog check failed" -ForegroundColor Red
}
Write-Host ""
Write-Host "Verification complete." -ForegroundColor Cyan

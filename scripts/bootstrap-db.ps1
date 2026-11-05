# Prepara la base de datos de un despliegue: aplica las migraciones, crea los roles y la cuenta de la plataforma, y termina.
# Se ejecuta UNA VEZ por despliegue nuevo, y de nuevo cuando una versión trae migraciones nuevas. Es seguro repetirlo.
#
# Los valores se leen de variables de entorno que defines en TU terminal (nunca los pegues en un chat ni los guardes en el repo):
#   $env:CS_DIRECT_CONNECTION = "Host=...;Database=...;Username=...;Password=...;SSL Mode=Require"   # cadena DIRECTA de Neon (sin -pooler)
#   $env:CS_SUPER_EMAIL       = "tu-correo@ejemplo.com"
#   $env:CS_SUPER_PASSWORD    = "una contraseña larga y única"
# Uso:  powershell -File scripts/bootstrap-db.ps1
$ErrorActionPreference = 'Stop'
foreach ($name in 'CS_DIRECT_CONNECTION', 'CS_SUPER_EMAIL', 'CS_SUPER_PASSWORD') {
    if (-not (Get-Item "env:$name" -ErrorAction SilentlyContinue)) { throw "Falta la variable de entorno $name (ver el encabezado de este script)." }
}
$env:ConnectionStrings__Default = $env:CS_DIRECT_CONNECTION
$env:Database__Provider = 'Postgres'
$env:Seed__SuperEmail = $env:CS_SUPER_EMAIL
$env:Seed__SuperPassword = $env:CS_SUPER_PASSWORD
$env:Jwt__Key = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))  # solo para arrancar; aquí no se emiten sesiones
$env:ASPNETCORE_ENVIRONMENT = 'Production'
$env:Logging__LogLevel__Default = 'Warning'
$env:Logging__LogLevel__Microsoft = 'Warning'
dotnet run --project (Join-Path $PSScriptRoot '..\Backend\src\ChurchSeeker.WebAPI') -c Release -- --bootstrap
if ($LASTEXITCODE -ne 0) { throw "El bootstrap falló (código $LASTEXITCODE)." }
Write-Host 'Base de datos lista.'

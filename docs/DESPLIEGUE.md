# Despliegue en Vercel + Neon

Un solo contenedor sirve la aplicación web y la API (mismo origen: las cookies de sesión son de primera mano y no hace falta CORS). La base de datos es PostgreSQL en Neon, y ahí mismo se guardan los PDF y logos (límite: 4 MiB por PDF).

## Qué hay que saber antes

- **Vercel Hobby es solo para uso no comercial.** Para una iglesia que recibe donaciones o cobra, revisa los términos o usa el plan Pro.
- **El runtime de contenedores de Vercel está en beta** y sin SLA (según su documentación al momento de escribir esto; verifícalo). El mismo `Dockerfile` corre en Render, Fly.io, Azure Container Apps o cualquier host de contenedores; solo cambian las variables de entorno.
- **Arranques en frío:** la instancia se apaga sin tráfico y .NET + Neon tardan un par de segundos en despertar. La primera visita tras un rato quieto es lenta; las siguientes no.
- **Neon gratis** suspende el cómputo a los 5 minutos sin uso y tiene 0.5 GB de almacenamiento. Cada PDF ocupa hasta 4 MiB (unos 100 en total) y un libro desactivado conserva su archivo.
- **Límites de petición de Vercel:** el cuerpo no puede pasar de 4.5 MB (por eso el límite de 4 MiB) y las respuestas tampoco; un informe PDF muy grande podría rechazarse.
- **Limitación de intentos por instancia:** cada instancia cuenta por su cuenta. El bloqueo de cuentas tras fallos de contraseña sí es global (vive en la base).
- **Correo:** el restablecimiento de contraseña necesita SMTP saliente. Si Vercel bloquea el puerto, usa un proveedor con SMTP en 587/465 o ajusta el envío a su API HTTP.

## 1. Neon

1. Crea un proyecto en Neon (región cercana a la de Vercel).
2. En **Connect** copia las dos cadenas: la **pooled** (host con `-pooler`) y la **directa**.
3. Conviértelas al formato de Npgsql (Neon las da como URI):

```
# Para la aplicación (pooled, con el pooler de Neon)
Host=ep-xxxx-pooler.<region>.aws.neon.tech;Database=neondb;Username=<usuario>;Password=<contraseña>;SSL Mode=Require;Maximum Pool Size=5;Timeout=15;Command Timeout=30;Keepalive=30;Connection Idle Lifetime=60;No Reset On Close=true

# Para las migraciones (directa: el mismo host sin "-pooler" y sin las opciones del pool)
Host=ep-xxxx.<region>.aws.neon.tech;Database=neondb;Username=<usuario>;Password=<contraseña>;SSL Mode=Require
```

## 2. Preparar la base (una vez)

En tu máquina, con .NET 8 instalado, define las variables en tu terminal (no las pegues en chats ni las guardes en el repo):

```powershell
$env:CS_DIRECT_CONNECTION = "<cadena directa>"
$env:CS_SUPER_EMAIL = "<tu correo>"
$env:CS_SUPER_PASSWORD = "<contraseña larga y única>"
powershell -File scripts/bootstrap-db.ps1
```

Aplica las migraciones, crea los roles y la cuenta de la plataforma (SuperAdministrador). Es repetible. **Repítelo antes de desplegar una versión que traiga migraciones nuevas.** El servidor en producción no toca el esquema al arrancar (arranca rápido y sin carreras entre instancias).

## 3. Vercel

1. `vercel login` (en tu terminal) y crea un proyecto desde este repositorio, con la raíz en `/`.
2. Elige el preset de contenedor que use el `Dockerfile` de la raíz. **No verifiqué el nombre exacto del preset ni que el límite de 4.5 MB aplique igual a contenedores:** sigue la guía oficial de Vercel para contenedores, que es la referencia vigente.
3. Variables de entorno (Production):

| Variable | Valor |
|---|---|
| `ConnectionStrings__Default` | la cadena **pooled** |
| `Jwt__Key` | una clave aleatoria de 32 bytes o más (p. ej. `openssl rand -base64 48`) |
| `Email__Host`, `Email__Port`, `Email__User`, `Email__Password`, `Email__From` | tu proveedor SMTP |
| `Email__ResetBaseUrl` | la URL pública de la app, p. ej. `https://tu-app.vercel.app` |

Ya vienen fijadas en la imagen: `Storage__Provider=Database`, `Database__Provider=Postgres`, `ForwardedHeaders__Enabled=true`, `ASPNETCORE_ENVIRONMENT=Production`. **Nunca** actives `Seed__Demo` (la aplicación se niega a arrancar). `Cors__AllowedOrigins` se deja vacío: no hace falta con un solo origen.

4. Despliega. Comprueba `https://tu-app.vercel.app/api/health` → `{"status":"ok"}`.

## 4. Primera verificación

1. Entra con la cuenta de la plataforma (`CS_SUPER_EMAIL`).
2. Cambia a una iglesia, sube un PDF de menos de 4 MiB y ábrelo desde la página pública.
3. Descarga un informe en PDF y en Excel.
4. Prueba «¿Olvidaste tu contraseña?» y comprueba que llega el correo y que el enlace funciona.
5. **Dirección del cliente:** la limitación de intentos usa `X-Forwarded-For` (con un solo salto de proxy; si el host no reemplaza esa cabecera, un cliente podría falsearla). Si tras desplegar todos los usuarios comparten el mismo contador (te bloquean tras 10 intentos entre todos), define `ForwardedHeaders__ForwardedForHeaderName` con la cabecera que tu host ponga con la IP real (no verificado en Vercel: prueba `X-Forwarded-For` y, si no sirve, `X-Real-IP`).

## Probar la imagen en local

```bash
docker build -t churchseeker .
docker run --rm -p 8080:8080 -e ConnectionStrings__Default="Host=host.docker.internal;Database=cs;Username=postgres;Password=..." -e Jwt__Key="una-clave-de-32-bytes-o-mas-........" churchseeker
```

(La base debe haber pasado antes por `--bootstrap`.) Esta imagen se probó con Postgres 16: inicio de sesión, subida de un PDF de exactamente 4 MiB (el de 4 MiB + 1 byte se rechaza), informes PDF y Excel, y contadores de intentos separados por cliente.

## Notas de seguridad

- Las claves que protegen los enlaces de restablecimiento se guardan en la tabla `DataProtectionKeys` (en texto, dentro de la base cifrada en reposo por Neon); sin ellas los enlaces dejarían de valer en cada arranque en frío.
- La aplicación solo confía en `X-Forwarded-For` cuando `ForwardedHeaders__Enabled=true`. No lo actives en un host que no esté detrás de un proxy propio.

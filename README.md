# ChurchSeeker

Plataforma web para las iglesias de Mérida, Yucatán: una experiencia pública con un mapa real y modelos 3D de cada iglesia, y un panel de administración eclesiástica (miembros, eventos, asistencia, ministerios, donaciones, comunicados, reportes y configuración) con control de acceso por roles.

El plan maestro y la bitácora de avance están en [`implementationplan.md`](implementationplan.md).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `Backend/` | Solución .NET 8: `Domain`, `Application`, `Infrastructure`, `WebAPI` y dos proyectos de pruebas (`UnitTests`, `BreakTests`). |
| `Frontend/` | React + TypeScript + Vite, Three.js (React Three Fiber), MapLibre, GSAP, react-pdf. Pruebas con Vitest y Playwright. |

## Requisitos

.NET SDK 8 o superior, Node.js 20 o superior y Microsoft Edge (lo usa Playwright; no se descarga ningún navegador). Docker es opcional: levanta PostgreSQL y un buzón de correo de pruebas.

## Ejecutar en desarrollo

```bash
# API (http://localhost:5054). Crea la base SQLite, los datos de demostración y, si se piden, un administrador.
dotnet run --project Backend/src/ChurchSeeker.WebAPI --launch-profile http -- \
  --Seed:AdminEmail=admin@churchseeker.local --Seed:AdminPassword='<contraseña segura>'

# Frontend (http://localhost:5173, con proxy a la API)
cd Frontend && npm install && npm run dev
```

- Público: `http://localhost:5173/` (mapa, iglesias, estante de códices).
- Personal: `http://localhost:5173/#/login`. El primer administrador sale de las opciones `Seed:AdminEmail` y `Seed:AdminPassword`; desde **Usuarios** (solo Administrador) se crean, se cambia el rol, se desactivan o reactivan los demás usuarios y se les envía un correo de restablecimiento. La misma pantalla muestra la matriz de roles y permisos.
- `appsettings.Development.json` activa `Seed:Demo` (3 iglesias con eventos, avisos, ministerios y libros PDF de muestra). No lo actives en producción.

## PostgreSQL y correo con Docker

Copia `.env.example` a `.env` (solo valores de desarrollo) y ejecuta:

```bash
docker compose up -d      # PostgreSQL 16 en localhost:5433 y Mailpit (buzón de pruebas) en http://localhost:8025
```

Luego arranca la API con el proveedor PostgreSQL. Las migraciones EF se aplican solas al iniciar (`Database:Migrate`):

```bash
Database__Provider=Postgres \nConnectionStrings__Default='Host=localhost;Port=5433;Database=churchseeker;Username=churchseeker;Password=churchseeker_dev' \nEmail__Host=localhost Email__Port=1025 Email__ResetBaseUrl=http://localhost:5173 \ndotnet run --project Backend/src/ChurchSeeker.WebAPI --launch-profile http
```

Sin `Email:Host` el correo solo se registra en el log. Con `Email:Host` se envía por SMTP (MailKit); en producción define `Email:UseSsl`, `Email:User`, `Email:Password` y `Email:From` con secretos del entorno, nunca en el repositorio. Para crear una migración nueva: `dotnet tool restore` y `dotnet ef migrations add <Nombre> --project src/ChurchSeeker.Infrastructure --startup-project src/ChurchSeeker.Infrastructure --output-dir Migrations` (con `CHURCHSEEKER_DESIGN_CS` apuntando a la base).

## Pruebas

```bash
cd Backend && dotnet test              # UnitTests + BreakTests (pruebas destructivas), en SQLite
CHURCHSEEKER_TEST_PG='Host=localhost;Port=5433;Username=churchseeker;Password=churchseeker_dev' dotnet test   # las mismas pruebas, cada fábrica con su base PostgreSQL desechable
cd Frontend && npm test                # Vitest
cd Frontend && npm run e2e             # Playwright (levanta la API y el build; usa Edge)
```

## Seguridad (resumen)

- Contraseñas con política estricta, bloqueo tras 5 intentos, JWT de 15 minutos y refresh token rotativo en cookie `HttpOnly; Secure; SameSite=Strict`; reutilizar un refresh revocado cierra todas las sesiones.
- Aislamiento por iglesia con filtro global (un recurso de otra iglesia responde 404), roles verificados en el servidor, auditoría inmutable y borrado siempre lógico.
- Subida de archivos validada por contenido (firmas), con rechazo de PDF con scripts o archivos incrustados, nombres generados por el servidor y tamaños limitados.
- Rate limiting (login, calendario público, reportes), CORS estricto, cabeceras de seguridad y CSP en el build del frontend.
- El token de acceso vive solo en memoria; el frontend trata todo texto del servidor como texto.

## Decisiones y límites conocidos

- **Base de datos:** SQLite por defecto en desarrollo; PostgreSQL con migraciones EF (`Database:Provider=Postgres`), probado con toda la suite. Falta un entorno de producción administrado (copias de seguridad, TLS hacia la base).
- **Usuarios:** cambiar el rol o desactivar a alguien invalida su sesión al instante (el token se revalida contra la base en cada solicitud y se revocan sus refresh tokens). Nadie puede cambiarse a sí mismo y siempre queda al menos un administrador activo. Los permisos por rol son fijos en el código; la matriz es de solo lectura.
- **Mapa:** MapLibre con mosaicos Esri (sin API key). Para producción, cambiar a Google Maps u otro proveedor: la capa 3D de iglesias no depende de la base.
- **Modelos 3D:** las iglesias se generan por código a partir de su estilo; un `.glb` subido por el administrador (RF-10) tiene prioridad. La fidelidad real requiere un modelo de cada iglesia.
- **Correo:** SMTP real con MailKit cuando `Email:Host` está definido; si no, solo se registra en el log. Falta elegir y probar un proveedor de producción.
- **PDF:** el escaneo busca contenido activo por bytes; no detecta el que esté dentro de flujos comprimidos.
- **QuestPDF** se usa con licencia Community.
- **Inicio de sesión:** correo y contraseña. No hay enlace por correo ni GitHub.

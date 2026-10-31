# ChurchSeeker

Plataforma web para las iglesias de Mérida, Yucatán: una experiencia pública con un mapa real y modelos 3D de cada iglesia, y un panel de administración eclesiástica (miembros, eventos, asistencia, ministerios, donaciones, comunicados, reportes y configuración) con control de acceso por roles.

El plan maestro y la bitácora de avance están en [`implementationplan.md`](implementationplan.md).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `Backend/` | Solución .NET 8: `Domain`, `Application`, `Infrastructure`, `WebAPI` y dos proyectos de pruebas (`UnitTests`, `BreakTests`). |
| `Frontend/` | React + TypeScript + Vite, Three.js (React Three Fiber), MapLibre, GSAP, react-pdf. Pruebas con Vitest y Playwright. |

## Requisitos

.NET SDK 8 o superior, Node.js 20 o superior y Microsoft Edge (lo usa Playwright; no se descarga ningún navegador).

## Ejecutar en desarrollo

```bash
# API (http://localhost:5054). Crea la base SQLite, los datos de demostración y, si se piden, un administrador.
dotnet run --project Backend/src/ChurchSeeker.WebAPI --launch-profile http -- \
  --Seed:AdminEmail=admin@churchseeker.local --Seed:AdminPassword='<contraseña segura>'

# Frontend (http://localhost:5173, con proxy a la API)
cd Frontend && npm install && npm run dev
```

- Público: `http://localhost:5173/` (mapa, iglesias, estante de códices).
- Personal: `http://localhost:5173/#/login`. El primer administrador sale de las opciones `Seed:AdminEmail` y `Seed:AdminPassword`; desde **Configuración → Personal con acceso** se crean los demás usuarios.
- `appsettings.Development.json` activa `Seed:Demo` (3 iglesias con eventos, avisos, ministerios y libros PDF de muestra). No lo actives en producción.

## Pruebas

```bash
cd Backend && dotnet test              # UnitTests + BreakTests (pruebas destructivas)
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

- **Base de datos:** SQLite en desarrollo y pruebas; falta elegir y probar el proveedor de producción (SQL Server o PostgreSQL) y generar migraciones EF.
- **Mapa:** MapLibre con mosaicos Esri (sin API key). Para producción, cambiar a Google Maps u otro proveedor: la capa 3D de iglesias no depende de la base.
- **Modelos 3D:** las iglesias se generan por código a partir de su estilo; un `.glb` subido por el administrador (RF-10) tiene prioridad. La fidelidad real requiere un modelo de cada iglesia.
- **Correo:** el envío de recuperación de contraseña es un stub que registra el token en el log (nivel Debug). Falta un proveedor SMTP.
- **PDF:** el escaneo busca contenido activo por bytes; no detecta el que esté dentro de flujos comprimidos.
- **QuestPDF** se usa con licencia Community.
- **Inicio de sesión:** correo y contraseña. No hay enlace por correo ni GitHub.

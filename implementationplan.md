# Plan de Implementación: Plataforma Web Eclesiástica Interactiva — ChurchSeeker (Piloto Mérida, Yucatán)

> **Instrucciones Críticas para la IA de Desarrollo (Sonnet 5.5):**
> 1. **Fuente de Verdad y Recuperación de Estado:** Este documento es el registro maestro del proyecto. Ante cualquier corte de conexión, reinicio de contexto o agotamiento de tokens, tu **primer paso obligatorio** al iniciar sesión es leer este archivo y consultar el estado de los *Issues* y *Commits* en `https://github.com/Juulren/churchseeker.git` para retomar exactamente desde la última casilla `[ ]` pendiente.
> 2. **Actualización Continua:** Cada vez que completes una subtarea, hagas un *commit* o cierres un *Issue*, **debes actualizar este archivo cambiando `[ ]` por `[x]`** e indicando el hash del commit o número de PR/Issue correspondiente.
> 3. **Arquitectura y Calidad:** Respeta estrictamente POO, MVC, SOLID y CRUD en el Backend (C#), construye un Frontend sin límites de renderizado (3D Low-Poly + Shaders ASCII + Estética RPG), aplica seguridad de grado producción y ejecuta pruebas destructivas (diseñadas para romper el sistema) antes de dar por cerrado cualquier módulo.

---

## 1. Visión General del Proyecto

El proyecto **ChurchSeeker** consiste en una plataforma web integral que fusiona dos mundos:

1. **Experiencia Pública e Interactiva con Estética RPG / Low-Poly 3D:** Centrada inicialmente en **3 iglesias piloto en Mérida, Yucatán**. El usuario explora un mapa interactivo de Mérida donde las iglesias destacan como modelos 3D Low-Poly personalizados según su denominación, santos o arquitectura. Al seleccionar una iglesia, la cámara hace zoom y transiciona a una vista estilo RPG (el modelo 3D interactivo a la izquierda y la interfaz de información, eventos y el "Estante de Códices/Archivos" a la derecha). Todo acompañado de fondos dinámicos con arte y shaders **ASCII animados**.
2. **Sistema de Gestión Eclesiástica (ERP/CRM Administrativo):** Un panel robusto con control de acceso basado en roles (RBAC) para administrar miembros, asistencia, eventos, ministerios, finanzas (donaciones), comunicados, reportes exportables y configuración institucional (RF-01 a RF-10).

*(Nota terminológica: A los "escritos", libros físicos y documentos históricos o administrativos digitalizados de cada iglesia los denominaremos en el sistema como **"Acervo / Códices Parroquiales"** en la interfaz RPG, y **`ChurchArchiveBook`** a nivel de código).*

---

## 2. Flujo de Trabajo en GitHub y Protocolo de Persistencia (Anti-Pérdida de Contexto)

Todo el ciclo de vida del código vivirá en el repositorio oficial:
* **Repositorio Remoto:** `https://github.com/Juulren/churchseeker.git`

### 2.1. Uso Completo del Ecosistema GitHub
La IA debe operar utilizando `git` y GitHub CLI (`gh`) para gestionar el proyecto de forma profesional:
* **Issues:** Cada Requerimiento Funcional (`RF-01` a `RF-10`), módulo visual 3D, blindaje de seguridad y suite de pruebas debe tener su propio *Issue* creado en GitHub con etiquetas claras (`enhancement`, `security`, `bug`, `testing`, `3d-rpg`, `backend-csharp`).
* **Ramas (GitFlow Simplificado):**
  * `main`: Código de producción estable y probado.
  * `develop`: Rama de integración continua.
  * `feat/rf-XX-nombre`, `feat/rpg-3d-nombre`, `sec/nombre-blindaje`, `test/break-modulo`: Ramas de trabajo por funcionalidad o prueba.
* **Commits Semánticos (Conventional Commits):**
  * Formato obligatorio: `feat(rf-01): implement JWT auth and role guards (#1)` o `test(rf-06): add destructive negative tests for anonymous donations (#6)`.
* **Pull Requests (PRs):**
  * Ningún cambio entra a `develop` o `main` sin un Pull Request detallado que referencie el Issue que resuelve (`Closes #X`), liste los cambios realizados y adjunte el resultado de las pruebas destructivas.

### 2.2. Protocolo de Continuidad (Fail-Safe por Tokens o Desconexión)
Para evitar perder el hilo si se agotan los tokens o falla la red:
1. **Trabajo Atómico:** Divide el desarrollo en entregas pequeñas. No escribas 20 archivos sin antes hacer *commit* y actualizar el checklist de este `implementationplan.md`.
2. **Bitácora en Vivo:** Al finalizar cada bloque funcional:
   * Ejecuta pruebas.
   * Marca `[x]` en la sección **9. Master Checklist de Implementación** de este archivo.
   * Actualiza la tabla de **Estado Actual de Sesión** (al final del documento) indicando cuál fue el último archivo editado y cuál es el siguiente paso inmediato.
   * Haz `git commit` y `git push` a la rama activa.

---

## 3. Stack Tecnológico Definido

### 3.1. Backend (C# / .NET 8+)
* **Framework:** ASP.NET Core 8.0 (Arquitectura MVC / Web API RESTful).
* **Paradigma y Principios:** Programación Orientada a Objetos (POO), principios **SOLID**, Separación de Responsabilidades (SoC) y operaciones **CRUD** estandarizadas.
* **ORM y Base de Datos:** Entity Framework Core (Code-First) con SQL Server o PostgreSQL.
* **Autenticación y Seguridad:** ASP.NET Core Identity + JWT + Refresh Tokens en cookies `HttpOnly`.
* **Generación de Reportes:** `QuestPDF` (para exportación a PDF) y `ClosedXML` (para exportación a Excel).
* **Testing:** `xUnit`, `Moq`, `FluentAssertions` y `Bogus` (para generación de datos masivos y *fuzzing*).

### 3.2. Frontend (Sin límites de renderizado y animación)
* **Core Framework:** React (Vite) + TypeScript.
* **Motor 3D y WebGL:** **Three.js** mediante **React Three Fiber (R3F)** y `@react-three/drei`.
* **Integración de Mapa + 3D:** **Mapbox GL JS** (con capas WebGL personalizadas / `threebox`) o **Google Maps JS API (WebGL Overlay View)** para anclar las 3 iglesias Low-Poly en Mérida.
* **Motor de Animaciones:** **GSAP (GreenSock)** + **Framer Motion**.
* **Fondo ASCII Animado:** Post-Processing Shader WebGL / Canvas HTML5 a 60 FPS para renderizar arte ASCII dinámico sin bloquear el hilo principal.
* **Visor de Libros / PDFs:** `react-pdf` (`PDF.js`) integrado con animaciones 3D de apertura de libro de pasta gruesa.
* **Testing Frontend / E2E:** `Playwright` y `Vitest`.

---

## 4. Arquitectura del Backend (C#): POO, MVC y SOLID

1. **Aplicación de POO (Programación Orientada a Objetos):**
   * **Encapsulamiento:** Entidades con estado protegido, constructores validados y uso estricto de DTOs (`RequestDto`, `ResponseDto`).
   * **Herencia y Abstracción:** Clase base abstracta `BaseEntity` (`Id`, `CreatedAt`, `UpdatedAt`, `IsActive`) y `TenantEntity` (`ChurchId`) para aislar los datos de las 3 iglesias de Mérida.
   * **Polimorfismo:** Interfaces como `IReportExporter` implementadas por `PdfReportExporter` y `ExcelReportExporter`.
2. **Aplicación de Principios SOLID:**
   * **S (Single Responsibility):** Controladores delgados (solo HTTP); lógica de negocio en Servicios; persistencia en Repositorios; validación en `FluentValidation`.
   * **O (Open/Closed):** Nuevos tipos de reportes o filtros se agregan implementando interfaces sin modificar clases existentes.
   * **L (Liskov Substitution):** Cumplimiento estricto de contratos en todas las implementaciones de `IRepository<T>` y servicios.
   * **I (Interface Segregation):** Interfaces segregadas (`IMemberService`, `IAttendanceService`, `IDonationService`, `IArchiveBookService`).
   * **D (Dependency Inversion):** Inyección de dependencias nativa de .NET en todas las capas.

---

## 5. Seguridad Integral (Protección Web y de Usuarios)

El sistema debe estar blindado tanto a nivel de infraestructura web como en la privacidad de los miembros y las finanzas de cada iglesia:

### 5.1. Seguridad de Usuarios y Autenticación
* **Hashing de Contraseñas:** Uso de `PBKDF2` / `Argon2id` o `BCrypt` con *salt* criptográfico único por usuario. Políticas de contraseñas seguras y bloqueo temporal de cuenta tras 5 intentos fallidos (*Account Lockout* contra fuerza bruta).
* **Manejo de Sesiones (JWT + Refresh Tokens):** Tokens de acceso (JWT) de corta duración (15 min) combinados con *Refresh Tokens* rotativos almacenados en cookies `HttpOnly`, `Secure` y `SameSite=Strict` para mitigar robo de sesión por XSS.
* **Aislamiento Multi-Iglesia (Tenant Isolation):** Un usuario autenticado en la "Iglesia A" **jamás** podrá consultar, modificar ni exportar datos de la "Iglesia B", incluso si manipula los IDs en las peticiones HTTP (*Mitigación de IDOR - Insecure Direct Object Reference*).
* **Protección de Datos Personales y Financieros:**
  * Los datos sensibles de contacto y aportaciones económicas están protegidos bajo control estricto de roles.
  * Las donaciones anónimas (RF-06) garantizan cero trazabilidad hacia un miembro en los registros y logs de auditoría.
  * Logs de auditoría (`AuditLog`) inmutables para registrar quién creó, editó o eliminó registros críticos (especialmente en finanzas y configuración).

### 5.2. Seguridad de la Aplicación Web y API (OWASP Top 10)
* **Validación Estricta de Archivos Subidos (PDFs del Estante y Modelos 3D):**
  * No confiar en la extensión `.pdf`, `.png` o `.glb`. Validar la firma binaria (*Magic Bytes* en la cabecera del archivo).
  * Límite estricto de tamaño de archivo, renombrado con `GUID` aleatorio al guardar (para evitar *Path Traversal*) y desinfección de metadatos/scripts incrustados en PDFs.
* **Mitigación de Inyecciones (SQLi / XSS / CSRF):**
  * Consultas 100% parametrizadas mediante EF Core (prohibido concatenar strings en SQL).
  * Sanitización de entradas HTML/Texto en comunicados (RF-07) y descripciones de eventos (RF-04) para evitar *Stored XSS*.
  * Cabeceras de seguridad HTTP: `Content-Security-Policy (CSP)`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security (HSTS)`.
* **Rate Limiting y CORS:**
  * Middleware de *Rate Limiting* en .NET 8 (especialmente estricto en `/api/auth/login`, `/api/auth/forgot-password` y descargas de reportes) para prevenir ataques DDoS o fuerza bruta.
  * Política CORS restrictiva que solo permite orígenes autorizados.

---

## 6. Estrategia de Pruebas Destructivas (QA "Break-It" Testing)

> **Regla de Oro de QA:** No hagas pruebas solo para confirmar que el código funciona ("Happy Path"). **Diseña pruebas específicamente con la intención de hacer que el sistema falle, colapse o revele vulnerabilidades.** Si una prueba logra romper el sistema, se documenta en un Issue de GitHub, se corrige el código y se mantiene el test como regresión.

Cada módulo deberá superar las siguientes baterías de pruebas antes de marcarse como completado:

1. **Pruebas de Ruptura de Roles y Permisos (Privilege Escalation & IDOR):**
   * Intentar acceder a los endpoints financieros de Donaciones (RF-06) o al resumen de ingresos del Dashboard (RF-08) usando tokens de `Coordinador`, `Secretario`, usuarios no autenticados o tokens expirados/manipulados.
   * Intentar que el `Secretario` de la Iglesia 1 modifique un miembro o descargue un PDF privado de la Iglesia 2 cambiando el `ChurchId` o `BookId` en el payload.
2. **Pruebas de Carga Maliciosa y Límites (Fuzzing & Boundary Testing):**
   * Enviar montos negativos (`-5000.00`), cero (`0`), `NaN`, o números desbordados (`decimal.MaxValue + 1`) en Donaciones (RF-06).
   * Inyectar payloads de SQL Injection (`' OR 1=1 --`) y scripts XSS (`<script>alert(1)</script>`) en el buscador de miembros (RF-02), creación de comunicados (RF-07) y títulos de libros.
   * Subir un archivo ejecutable (`.exe` o `.sh`) o un archivo corrupto de 500 MB renombrado como `libro_sagrado.pdf` en el estante de códices para verificar que el validador de *Magic Bytes* lo rechace inmediatamente.
3. **Pruebas de Integridad y Concurrencia:**
   * Intentar eliminar físicamente un miembro (debe fallar o forzar borrado lógico `IsActive = false`).
   * Simular registros simultáneos de asistencia duplicada para el mismo miembro en el mismo evento (RF-03).
   * Intentar leer un PDF marcado como `Privado (IsPublic = false)` desde la vista pública RPG sin haber iniciado sesión.
4. **Pruebas de Estrés Gráfico (Frontend 3D / ASCII):**
   * Hacer clics rápidos y repetitivos (spam-click) entre las 3 iglesias del mapa y los libros del estante para intentar romper las animaciones de cámara de GSAP o causar fugas de memoria (*WebGL Context Lost*).

---

## 7. Experiencia Visual e Interactiva (Estética RPG / Mérida 3D)

### 7.1. Fondo de Pantalla ASCII Dinámico
* Componente `<AsciiBackground />` renderizado vía WebGL Shaders / Canvas a 60 FPS.
* Animaciones en caracteres ASCII que reaccionan al cursor y adaptan su paleta de colores según la iglesia seleccionada.

### 7.2. Mapa de Mérida + 3 Iglesias Low-Poly 3D
* Mapa centrado en Mérida, Yucatán (`20.9674° N, 89.5926° W`) con estética RPG.
* Las **3 iglesias piloto** renderizadas en 3D Low-Poly (`.glb`), decoradas según su tradición religiosa, santos y arquitectura colonial.
* Selección interactiva con transición de cámara cinematográfica (zoom in).

### 7.3. Vista de Detalle Estilo RPG (Split-Screen) y Estante de Libros
* **Izquierda (40%):** Render 3D Low-Poly interactivo de la iglesia seleccionada + datos institucionales (RF-10).
* **Derecha (60%):** Eventos públicos, anuncios y el **Estante de Códices/Libros**.
* **Estante de Libros ("Pasta Gorda"):**
  * Visualización de los lomos gruesos de los libros en el estante.
  * Animación al pasar el cursor (`hover`) donde el libro sobresale e indica si es **Público** o **Privado (Personal de la Iglesia)**.
  * Animación de selección y apertura de lectura del PDF integrado.

---

## 8. Estructura del Repositorio (`churchseeker`)

```text
/churchseeker
├── /.github
│   ├── /ISSUE_TEMPLATE          # Plantillas para Features (RF), Bugs y Security/Break Tests
│   └── pull_request_template.md # Checklist de POO, SOLID, Seguridad y Pruebas antes de merge
├── /Backend                     # Solución .NET 8 (C#)
│   ├── /src
│   │   ├── /ChurchSeeker.Domain          # Entidades POO, Enums, Excepciones de Dominio
│   │   ├── /ChurchSeeker.Application     # DTOs, Interfaces SOLID, Validadores (FluentValidation)
│   │   ├── /ChurchSeeker.Infrastructure  # EF Core, Repositorios, Exportadores PDF/Excel, Seguridad
│   │   └── /ChurchSeeker.WebAPI          # Controladores MVC/API, Middlewares, RateLimiting, JWT
│   └── /tests
│       ├── /ChurchSeeker.UnitTests       # Pruebas unitarias y de lógica de negocio
│       └── /ChurchSeeker.BreakTests      # Suite de pruebas destructivas, Fuzzing, IDOR y Seguridad
├── /Frontend                    # React + TypeScript + Vite + Three.js (R3F) + GSAP
│   ├── /public/models           # Modelos .glb Low-Poly de las 3 iglesias de Mérida y libros
│   ├── /src
│   │   ├── /components
│   │   │   ├── /ascii           # Fondo animado ASCII WebGL
│   │   │   ├── /map3d           # Mapa de Mérida + Marcadores 3D Low-Poly
│   │   │   ├── /rpg-view        # Split-screen estilo RPG (Iglesia izq + Eventos/Estante der)
│   │   │   ├── /bookshelf       # Estante de libros pasta gorda animados + Lector PDF
│   │   │   └── /dashboard       # Módulos administrativos (RF-01 a RF-10)
│   │   ├── /services            # Clientes API con interceptores JWT y manejo de errores
│   │   └── /tests               # Pruebas E2E y de estrés visual con Playwright/Vitest
└── implementationplan.md        # ESTE ARCHIVO (Checklist maestro y bitácora de estado)
```

---

## 9. Master Checklist de Implementación (Seguimiento Paso a Paso)

> **Instrucción para la IA:** Marca con `[x]` cada ítem únicamente cuando el código esté escrito, probado con tests destructivos y subido a `https://github.com/Juulren/churchseeker.git`.

### Fase 0: Inicialización de GitHub y Entorno
- [x] **0.1.** Inicializar repositorio local y vincular remoto a `https://github.com/Juulren/churchseeker.git`.
- [x] **0.2.** Crear estructura de carpetas (`/Backend`, `/Frontend`, `/.github`), archivo `.gitignore` y plantillas de Issues/PRs.
- [x] **0.3.** (issues #1-#5) Crear los *Issues* iniciales en GitHub para las Fases 1 a 5 y asociarlos a este plan.
- [x] **0.4.** Configurar la solución `.sln` en C# (.NET 8) con las 4 capas limpias + 2 proyectos de pruebas (`UnitTests` y `BreakTests`).
- [x] **0.5.** Inicializar proyecto Frontend (React + TypeScript + Vite + Three.js + GSAP + Tailwind).

### Fase 1: Cimientos del Backend, Seguridad Base y RF-01 (Usuarios y Roles)
- [x] **1.1. Dominio POO Base:** Crear `BaseEntity`, `TenantEntity` (`ChurchId`) y entidades de las 3 iglesias iniciales de Mérida (*Database Seeder* con coordenadas reales).
- [x] **1.2. RF-01 (Autenticación y Roles):**
  - [x] Registrar usuarios del sistema e implementar login/logout con correo y contraseña (`Argon2`/`BCrypt` + JWT + Cookie `HttpOnly`).
  - [x] Flujo seguro de recuperación y restablecimiento de contraseñas con tokens de un solo uso y expiración corta.
  - [x] Configurar los 5 roles: `Administrador`, `Pastor`, `Secretario`, `Tesorero` y `Coordinador`.
  - [x] Implementar guardias de autorización por rol y filtro global Multi-Tenant (`ChurchId`).
- [x] **1.3. Seguridad Web Base:** Configurar *Rate Limiting*, CORS estricto, cabeceras de seguridad (CSP, HSTS, X-Frame-Options) y `AuditLog`.
- [x] **1.4. Break-Testing Fase 1 (bug #9 corregido):** Ejecutar pruebas de fuerza bruta en login, manipulación de firma JWT, escalada de privilegios entre roles y cruce de datos entre iglesias (IDOR).

### Fase 2: Módulos Operativos Core (RF-02, RF-03, RF-04, RF-05)
- [x] **2.1. RF-02 (Gestión de Miembros):**
  - [x] CRUD: Registrar nuevos miembros, consultar listado paginado y editar información personal (`Nombre`, `Teléfono`, `Correo`, `Fecha de ingreso`).
  - [x] Buscador por nombre y filtro por estado (`Activo` / `Inactivo`).
  - [x] Implementar desactivación lógica (`Soft Delete`) prohibiendo el borrado físico permanente.
- [x] **2.2. RF-04 (Gestión de Eventos):**
  - [x] Crear eventos religiosos y administrativos (`Título`, `Fecha`, `Hora`, `Lugar`, `Descripción`).
  - [x] Asignar responsables, modificar o cancelar eventos y exponer endpoint para calendario público e interno.
- [x] **2.3. RF-03 (Control de Asistencia):**
  - [x] Registrar asistencia a cultos, reuniones y actividades seleccionando fecha y evento.
  - [x] Marcar miembros presentes/ausentes, consultar historial y generar reportes semanales/mensuales.
- [x] **2.4. RF-05 (Administración de Ministerios):**
  - [x] Registrar ministerios (música, jóvenes, niños, enseñanza, servicio, etc.) y asignar `Coordinadores`.
  - [x] Vincular miembros a cada ministerio y consultar integrantes y actividades programadas.
- [x] **2.5. Break-Testing Fase 2:** Pruebas con inyección SQL/XSS en búsquedas, fechas inválidas en eventos, intento de borrado físico de miembros y duplicidad de asistencia concurrente.

### Fase 3: Finanzas, Comunicados, Configuración, Códices y Reportes (RF-06 a RF-10)
- [x] **3.1. RF-06 (Gestión de Donaciones y Aportaciones):**
  - [x] Capturar `Fecha`, `Monto`, `Concepto` y `Método de recepción`.
  - [x] Permitir registros 100% anónimos (`MemberId = null`) sin obligar asociación a una persona.
  - [x] Consultar ingresos por periodos, generar resumen mensual y blindar acceso exclusivamente a personal autorizado (`Tesorero` / `Administrador`).
- [x] **3.2. RF-07 (Comunicados y Anuncios):**
  - [x] Publicar, editar y eliminar anuncios con fecha de publicación y mostrar próximos eventos/avisos importantes.
- [x] **3.3. RF-10 (Configuración de la Iglesia + Estante de Libros PDF):**
  - [x] Registrar/actualizar nombre de la iglesia, logotipo, dirección, contacto, coordenadas en Mérida, modelo 3D y horarios habituales.
  - [x] Implementar subida segura de "Escritos / Códices" en PDF (validación de *Magic Bytes*, estilo de lomo grueso y bandera `Público` vs. `Privado para trabajadores`).
- [x] **3.4. RF-08 (Panel Principal / Dashboard):**
  - [x] Mostrar KPIs: Total de miembros activos, eventos próximos, asistencias registradas y cantidad de ministerios.
  - [x] Mostrar resumen de ingresos registrados **únicamente** para roles autorizados (oculto desde el backend para otros roles) + gráficas estadísticas.
- [ ] **3.5. RF-09 (Reportes Exportables):**
  - [ ] Generar reportes de: Miembros, Asistencia por evento, Participación por ministerio e Ingresos por periodo.
  - [ ] Implementar exportación polimórfica a **PDF** y **Excel (`.xlsx`)**.
- [ ] **3.6. Break-Testing Fase 3:** Intentar inyectar montos negativos en donaciones, acceder a reportes financieros con rol `Coordinador`/`Secretario`, y subir archivos `.exe` disfrazados de `.pdf` al estante de libros.

### Fase 4: Frontend Inmersivo — Estética RPG, Mapa 3D de Mérida, ASCII y Estante de Libros
- [ ] **4.1. Fondo Animado ASCII:** Construir `<AsciiBackground />` con shaders/canvas a 60 FPS sin bloqueo de UI.
- [ ] **4.2. Mapa Interactivo de Mérida + 3 Iglesias Low-Poly:**
  - [ ] Integrar mapa centrado en Mérida con los 3 modelos 3D Low-Poly personalizados según la religión/santos de cada iglesia.
  - [ ] Programar animación de selección y zoom cinematográfico con GSAP.
- [ ] **4.3. Vista Split-Screen RPG:**
  - [ ] Panel izquierdo con el render 3D interactivo de la iglesia seleccionada e información institucional.
  - [ ] Panel derecho con calendario de eventos públicos, avisos y acceso al Estante de Libros.
- [ ] **4.4. Estante Interactivo de Libros ("Pasta Gorda"):**
  - [ ] Renderizar estante con los lomos gruesos de los libros subidos en cada iglesia.
  - [ ] Animar el lomo al pasar el cursor (`hover`) y al seleccionarlo para abrir el visor de PDF integrado (respetando visibilidad pública vs. privada).
- [ ] **4.5. Break-Testing Fase 4:** Pruebas de estrés de WebGL (spam de clics en mapa y libros), intento de abrir PDFs privados desde el cliente sin sesión y responsividad.

### Fase 5: Frontend Administrativo (ERP Eclesiástico Completo) y Cierre
- [ ] **5.1.** Construir pantallas de Login, Recuperación de Contraseña y Layout protegido por roles (RF-01).
- [ ] **5.2.** Construir vistas del Dashboard con gráficas estadísticas y ocultamiento condicional de finanzas (RF-08).
- [ ] **5.3.** Construir interfaces CRUD para Miembros (RF-02), Asistencia (RF-03), Eventos con Calendario (RF-04) y Ministerios (RF-05).
- [ ] **5.4.** Construir módulo financiero de Donaciones Anónimas/Nominales (RF-06), Comunicados (RF-07), Descarga de Reportes PDF/Excel (RF-09) y Configuración + Subida de Libros PDF (RF-10).
- [ ] **5.5. Auditoría Final E2E:** Ejecutar toda la suite de pruebas E2E y *BreakTests*, verificar que todos los Issues en `https://github.com/Juulren/churchseeker.git` estén cerrados mediante PRs y hacer merge final a `main`.

---

## 10. Bitácora de Estado de Sesión (Para Recuperación ante Corte de Tokens/Red)

> **Instrucción para la IA:** Actualiza esta tabla antes de finalizar cualquier respuesta o tras completar cada subtarea.

| Parámetro de Control | Estado Actual |
| :--- | :--- |
| **Repositorio GitHub** | `https://github.com/Juulren/churchseeker.git` |
| **Fase Activa** | `Fase 3: Finanzas, Comunicados, Configuración, Códices y Reportes` |
| **Última Tarea Completada** | `3.4. RF-08 Dashboard (KPIs, gráfica semanal, ingresos solo Finance); 145+95 tests OK` |
| **Siguiente Tarea Inmediata** | `3.5. RF-09 Reportes PDF/Excel` |
| **Rama Git Activa** | `main` (pendiente crear `develop`) |
| **Último Commit / PR / Issue** | `90408ec / Issues #1-#5` |
| **Estado de Pruebas (Break-Tests)** | `UnitTests 90 OK + BreakTests 95 OK (SQLi, XSS, fechas hostiles, borrado fisico, carreras, fuzz de queries, IDOR, rate limit publico)` |
















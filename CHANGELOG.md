# Cambios

Formato: una entrada por entrega, lo más nuevo arriba. Cada cambio que afecta a resultados físicos enlaza su mini-diseño.

## 0.7.3 · 03-11-2026

- Corrección: con dos servidores AeroForja a la vez (cada ventana de Claude o sesión enlazada arranca el suyo), el segundo no podía abrir el puerto 47615 y trabajaba a ciegas: la app mostraba el diseño del otro y `app_status` decía «abre la app y se conecta sola». Ahora el servidor que Claude está usando toma el puente antes de cada herramienta (`POST /handover` al otro servidor AeroForja) y la app, avisada con un evento `handover`, se reconecta a él en menos de un segundo. Un servidor AeroForja antiguo o cualquier otro programa en el puerto se informa en `app_status` (`bridgeState`, con qué hacer) y no se pelea por él. `/handover` rechaza peticiones con cabecera `Origin`, así que una página web no puede quitar el puente. Sin cambios en la física.

## 0.7.2 · 03-11-2026

- Corrección: la 0.7.1 seguía sin registrar el servidor en la build de Windows que también ejecuta sesiones de Cowork/Code, que guarda `claude_desktop_config.json` en `%LOCALAPPDATA%\Claude-Data\<perfil>\`, no en `%APPDATA%\Claude` ni en la ruta virtualizada de la Microsoft Store — confirmado con el botón «Editar configuración» de `Settings → Desarrollador` de una instalación real. `pnpm mcp:install` ahora también escribe ahí (una entrada por cada perfil que tengas); las otras dos rutas se mantienen como fallback. Guía ampliada con cómo comprobarlo desde la propia app.

## 0.7.1 · 03-11-2026

- Corrección: `pnpm mcp:install` no registraba el servidor en Claude Desktop instalado desde la Microsoft Store, que lee su configuración de la carpeta virtualizada de su paquete y no de `%APPDATA%\Claude`. Ahora escribe en las dos; un `APPDATA` o `XDG_CONFIG_HOME` vacío ya no da una ruta relativa. Sección «Si Claude Desktop no muestra aeroforja» en la [guía](docs/claude-desktop.md).

## 0.7.0 · 02-11-2026

- **Túnel CFD** ([mini-diseño 006](docs/design/006-tunel-cfd-lbm.md)), adelantado de la v2: Lattice Boltzmann D3Q19 en WebGPU sobre todo el cuerpo 3D del dron. Da Cp en la piel (medio e instantáneo), humo, líneas de corriente, cortes de Cp, velocidad y vorticidad con la rejilla, balanza media junto al VLM y «Validar en tu GPU». Validado frente a Taylor–Green, Schäfer–Turek y GPU = CPU.
- **Ensayo de ráfaga** ([mini-diseño 007](docs/design/007-rafaga-y-flexion.md)), adelantado del MVP/v1: ráfaga 1 − cos con VLM no estacionario, movimiento vertical y de cabeceo, y flexión de la semiala como viga, con el ala deformada sobre la banda de la ráfaga y la ráfaga crítica. Validado frente a Jones, Küssner, Pratt–Walker y fórmulas de viga.
- Tour guiado con 4 pasos nuevos (29 en total) y secciones 14 y 15 del README.
- La vista de los túneles CFD y de ráfaga usa todo el ancho.
- `pnpm test:slow` y `pnpm test:gpu`.
- **Pendiente de aprobación**: la entrada del CFD toma la densidad de la celda interior (mini-diseño 006) y el caso de Küssner compara la sección central desde τ = 4 (mini-diseño 007).

## 0.6.0 · 31-10-2026

- **Tres vistas**: el dibujo pasa de planta sola a planta, perfil y alzado, con siluetas de las otras vistas, enganche a sus esquinas y la vista «Tres vistas + 3D». Archivos de proyecto v3; los v2 y v1 se siguen abriendo.
- **Túnel de viento virtual** ([mini-diseño 004](docs/design/004-tunel-de-barridos.md)): VLM con herraduras, inducida en el plano de Trefftz, resistencia parásita por componentes, punto neutro y margen estático, balanza de seis componentes, carga en envergadura, mapa de ΔCp y CSV. Semáforo de α: verde ≤ 5°, ámbar ≤ 10°, rojo > 10°.
- **Piezas STL** ([mini-diseño 005](docs/design/005-piezas-stl.md)): importar, colocar, comprobar la malla, masa e inercia exactas por tetraedros con signo, resistencia estimada por forma y área frontal real.
- **Claude Desktop**: servidor MCP propio y puente local en vivo con la app ([guía](docs/claude-desktop.md)).
- **Integración continua** en GitHub Actions.
- Corrección: signo del punto neutro en el texto del mini-diseño 004 (FRD).
- Pendiente de aprobación: tres tolerancias de validación del túnel (ver el mini-diseño 004).

## 0.5.0 · 30-10-2026

- Tour guiado y README ilustrado.

## 0.4.0 · 29-10-2026

- Editor de planta en un plano cartesiano, modelo 3D al momento, STL y SVG 1:1, Docker local y en el VPS.

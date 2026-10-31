# Cambios

Formato: una entrada por entrega, lo más nuevo arriba. Cada cambio que afecta a resultados físicos enlaza su mini-diseño.

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

# Decisiones del proyecto

Registro de las decisiones abiertas de la especificación y sus módulos, con la fecha en que se cerraron. Lo que cambia resultados físicos lo decide mupsim; el resto lo decide Claude y lo explica en una línea.

## Cerradas

| Fecha | Decisión | Quién | Notas |
|---|---|---|---|
| 2026-10-26 | Alcance de la PoC según el diagrama de la hoja de ruta (ISA, masas, propulsión con UIUC + hover de un quad, VLM de ala plana, visor 3D básico, tests) | mupsim | El 6DOF pasa al MVP; perfiles viscosos y BEMT a la v1 |
| 2026-10-27 | Humedad del aire como entrada opcional | mupsim | Mezcla ideal + Magnus; ver `docs/design/001-atmosfera-isa.md` |
| 2026-10-27 | Modo de condiciones medidas (presión de estación, temperatura, humedad) | mupsim | Para comparar con ensayos reales |
| 2026-10-27 | Mini-diseño 002, modelo de masas, aprobado tal cual | mupsim | Productos de inercia en positivo; GUM de primer orden |
| 2026-10-27 | La «tabla de 3 mm» del módulo de fabricación es tablero DM (MDF), no una placa impresa en FDM | mupsim | El banco de materiales arranca con DM 3 mm |
| 2026-10-27 | Framework de interfaz: React (propuesta por defecto de la especificación) | Claude | No cambia resultados físicos |
| 2026-10-27 | Interfaz en español; código, identificadores y comentarios en inglés | Claude | Como pide el proyecto |
| 2026-10-27 | Datos brutos de terceros (base UIUC) en `data/raw/`, fuera de git | Claude | Hasta aclarar si se pueden redistribuir; la web solo pide citarla |
| 2026-10-27 | Commits en el repo local los hace Claude; el push lo hace mupsim | mupsim | Esta sesión no tiene credenciales de GitHub |
| 2026-10-28 | Editor de planta 2D → modelo 3D adelantado a la PoC | mupsim | Parte del editor del MVP; solo geometría, sin masas ni aerodinámica. Ver `docs/design/003-planta-2d-a-3d.md` |
| 2026-10-28 | Despliegue Docker en local y en el VPS adelantado (estaba en la v1) | mupsim | `docker/` y `docs/despliegue.md` |
| 2026-10-28 | Operaciones booleanas de polígonos con polygon-clipping (MIT, Martínez-Rueda-Feito) | Claude | No cambia resultados físicos; evita escribir un recortador propio |
| 2026-10-28 | La planta del 3D se extruye como placa plana del espesor indicado | Claude | Es la técnica «placa plana» del módulo de fabricación; perfiles reales en la v1 |
| 2026-10-28 | En el VPS, `aeroforja.tenebrum.online` con basic auth por defecto | Claude | Mientras sigan abiertas la licencia y «uso personal o publicación» |

## Abiertas

- Primer aparato real: motor, hélice y batería. Propuesta: quad 450 con APC SF 10×4.7 (en la UIUC con ensayo estático, en avance y geometría).
- Licencia del proyecto y del solver de perfiles (GPL si se integra un derivado de XFOIL). Afecta a la v1.
- Uso personal o publicación; datos solo en el navegador o sincronizados con el VPS.
- Banco de empuje: ¿existe o se diseña dentro del proyecto?
- Firmware de controladora (Betaflight, INAV, ArduPilot, PX4).
- Cortadora láser (tipo, potencia, área, programa), impresora FDM, materiales en casa, tamaños de plancha, báscula.
- Nombre definitivo (AeroForja es provisional).

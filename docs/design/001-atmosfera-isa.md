# Mini-diseño 001 · Atmósfera ISA

Estado: **aprobado** (26-10-2026) e implementado en `packages/physics/src/atmosphere/`.

## Método

Atmósfera estándar, capa inferior (troposfera): ICAO Doc 7488/3 (1993), idéntica a ISO 2533:1975 y a la U.S. Standard Atmosphere 1976 por debajo de 32 km. Viscosidad por la ley de Sutherland (1893) con las constantes de la norma.

## Ecuaciones (H = altitud geopotencial, m)

| Magnitud | Expresión |
|---|---|
| Temperatura | T = 288,15 K − 0,0065 K/m · H |
| Presión | p = 101 325 Pa · (T / 288,15 K)^5,25588, exponente = −g0 / (L·R) |
| Densidad | ρ = p / (R·T), R = 287,05287 J/(kg·K) |
| Viscosidad dinámica | μ = 1,458×10⁻⁶ · T^1,5 / (T + 110,4 K) |
| Viscosidad cinemática | ν = μ / ρ |
| Velocidad del sonido | a = √(1,4 · R · T) |
| Altitud geopotencial | H = r0·Z / (r0 + Z), r0 = 6 356 766 m |

## Entradas y salidas

- Entradas: altitud **geométrica o geopotencial** (siempre se declara cuál) y temperatura opcional: estándar, ISA + ΔT o valor absoluto.
- Con temperatura no estándar, p es la de la ISA a esa altitud (la altitud actúa como altitud de presión) y ρ sale del gas ideal con la temperatura real.
- Salidas: H, T, p, ρ, μ, ν y a, en un `Result` CALCULADO con métodos, referencias, supuestos y semáforo.

## Supuestos

Aire seco, gas ideal, gravedad constante g0 = 9,80665 m/s². Con temperatura no estándar, la presión real del día (meteorología) no se modela.

## Validez

| Comprobación | Verde | Ámbar | Rojo |
|---|---|---|---|
| Altitud geopotencial | −5 000 a 11 000 m | — | fuera de la capa (el valor se devuelve, marcado) |
| Temperatura | 216,65 a 320,65 K | fuera de esa banda | — (≤ 0 K se rechaza) |

Para la temperatura no se fija un límite rojo porque no tenemos una cota citada de la ley de Sutherland; fuera de la banda validada queda en ámbar.

## Validación

- Referencia: tablas de ICAO Doc 7488/3, filas de H = −5 000, Z = −2 500, 0, 1 000, 2 000 y 11 000 m, y H = 11 000 m.
- Tolerancia: 1×10⁻⁴ relativo en T, p, ρ, a, μ y ν. Las tablas imprimen ≥ 5 cifras significativas; al ser una definición cerrada, un error mayor es un fallo de código.
- Resultado: error máximo 3,7×10⁻⁵ (ν a −5 000 m, en el límite del redondeo impreso).
- Procedencia de los números: transcripción de las tablas ICAO del proyecto abierto *ambiance* (commit 232032b), contrastada con la implementación independiente *ussa1976* 0.3.4 para Z ≥ 0. No se leyeron del documento ICAO original; si se consigue copia legible, se recomprueban.
- Un test impide ampliar los rangos «validados» del código sin añadir filas de referencia que los cubran.

## Cambios respecto a la propuesta inicial

- La validación usa las tablas ICAO (−5 a 11 km) en lugar de las de la U.S. Standard Atmosphere a 0–3 000 m: el escaneo de la NASA no es legible y la transcripción ICAO es contrastable. El modelo es el mismo en este tramo.
- Al cubrir toda la capa, el verde abarca de −5 000 a 11 000 m y desaparece la banda ámbar de altitud.

## Pendiente

- Humedad (presiones parciales + Magnus, Alduchov y Eskridge 1996): pendiente de decisión.
- Condiciones medidas (presión y temperatura de un barómetro): propuesta para comparar con ensayos reales en el MVP.

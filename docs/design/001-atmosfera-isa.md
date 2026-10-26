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

## Ampliación aprobada el 27-10-2026: humedad y condiciones medidas

### Humedad (entrada opcional)

- Método: mezcla ideal de aire seco y vapor (ley de Dalton), ρ = (p − e)/(R_d·T) + e/(R_v·T), con e = HR · e_s(T).
- Presión de saturación sobre agua líquida: forma de Magnus con las constantes de Alduchov y Eskridge (1996): e_s = 610,94 Pa · exp(17,625·t / (t + 243,04)), t en °C.
- R_v = R*/M_w, con el R* de ICAO y M_w = 18,01528 kg/kmol, coherente con R_d.
- Supuestos:
  - Se desprecia la compresibilidad del aire real, que llega a un 0,07 % en densidad.
  - La viscosidad y la velocidad del sonido son las del aire seco a esa temperatura. El vapor las cambia poco en aire templado y hasta unos pocos por ciento en aire caliente y saturado. Para el Mach de punta de hélice es irrelevante, pero queda declarado.
- Validez de la humedad:

| Comprobación | Verde | Ámbar | Rojo |
|---|---|---|---|
| Temperatura con humedad | 0 a 50 °C | −40 a 0 °C (rango del ajuste de Magnus, sin validar aquí) | fuera de −40 a 50 °C |
| Presión con humedad | 70 a 105 kPa | resto | — |

- Validación:

| Caso | Referencia | Tolerancia | Error máximo |
|---|---|---|---|
| Presión de saturación, 0 a 50 °C | IAPWS-95 | 0,3 % | 0,25 % |
| Densidad de aire húmedo, 90 puntos (70 a 105 kPa, 0 a 50 °C, HR 0 / 50 / 100 %) | Modelo de gas real ASHRAE RP-1485 | 0,1 % | 0,071 % |

- Procedencia de los números de referencia: calculados con CoolProp 8.0.0, la implementación abierta de referencia de esos dos modelos publicados. Están en `packages/validation` con su versión exacta para poder regenerarlos.
- En la propuesta la humedad iba siempre en ámbar porque no tenía validación. Ahora la tiene, así que dentro de la caja validada el semáforo es verde, como define la especificación.

### Condiciones medidas

`measuredAtmosphere({ pressure, temperature, relativeHumidity? })` calcula el estado del aire a partir de la presión de estación, la temperatura y la humedad (opcional) que mides tú, sin usar la altitud. Es para comparar con ensayos reales.

- La presión es la que lee el barómetro en el sitio, no el QNH reducido a nivel del mar.
- Validez de la presión en aire seco: verde entre 22,6 y 177,7 kPa, el rango que cubren las filas ICAO.

## Pendiente

- Incertidumbre de las condiciones medidas (propagar u(p), u(T) y u(HR) a ρ).

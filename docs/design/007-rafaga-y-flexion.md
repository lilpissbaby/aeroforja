# Mini-diseño 007 · Ensayo de ráfaga: factor de carga, sustentación extra y flexión del ala

Estado: **propuesto** (01-11-2026), pendiente de aprobación. El adelanto lo decidió mupsim el 01-11-2026. Junta dos piezas de fases posteriores: la ráfaga discreta 1−cos del entorno del simulador (especificación §11, MVP) y la comprobación estructural de la raíz del ala (especificación §12, v1).

## Qué responde

Qué le pasa a tu diseño de ala fija (ala volante, delta o convencional) cuando atraviesa a velocidad V una ráfaga vertical discreta. Es la prueba de la imagen de referencia del avión con el campo de ráfaga:

- Factor de carga `n(t) = 1 + Δn(t)` y su máximo, marcado en la gráfica.
- Sustentación extra `ΔL(t)`, ángulo de ataque efectivo, cabeceo `θ(t)` y velocidad de cabeceo `q(t)`.
- Momento flector en la raíz `M_x(t)`, tensión máxima en la placa `σ(t)` y, si das el módulo E de tu material, la flecha en punta `δ(t)` y la forma deformada en 3D coloreada por desplazamiento.
- Barrido de la longitud de la ráfaga para encontrar la crítica: n_max y M_x,max frente a H.

**Multirrotor: no disponible todavía.** Su respuesta a una ráfaga la deciden los rotores y la controladora, y la propulsión y el 6DOF aún no existen. La app lo dice en lugar de dar un número.

## Métodos y referencias

1. **Ráfaga discreta 1−cos** (MIL-F-8785C, 1980, modelo de ráfaga discreta; misma forma que CS-25.341(a); Wright y Cooper, *Introduction to Aircraft Aeroelasticity and Loads*, 2.ª ed., Wiley, 2015, cap. 16):
   `w_g(s) = (U_ds / 2) · (1 − cos(π s / H))` para `0 ≤ s ≤ 2H`, y 0 fuera.
   Aquí `s` es la distancia recorrida dentro de la ráfaga y `H` la distancia de gradiente (media longitud). Es vertical, hacia arriba por defecto, con opción hacia abajo. **Penetración**: cada panel la encuentra cuando llega a su x, `w_g,i(t) = w_g(V t − (x_frente − x_i))`, así que la cola la nota después que el ala.
2. **Aerodinámica: VLM no estacionario linealizado** con anillos de vórtice (Katz y Plotkin, *Low-Speed Aerodynamics*, 2.ª ed., §12.3 y §13.12; formulación lineal de Murua, Palacios y Graham, *Prog. Aerosp. Sci.* 55, 2012).
   - Mismas superficies y mismo mallado que el túnel de barridos. Cada panel lleva un anillo con su lado delantero en el 1/4 y el punto de control en el 3/4.
   - Estela plana desprendida del borde de salida, que se convecta a V∞ por −x cuerpo con geometría fija (pequeñas perturbaciones). Cada paso suelta una fila: `Γ_estela,1(t + Δt) = Γ_BS(t)` (Kutta). Se trunca a 20 c̄; la última fila sigue hasta el infinito, así que el límite estacionario coincide con el VLM de herraduras ya validado.
   - Paso de tiempo `Δt = c̄ / (N_c · V)`.
   - Por paso: `A Γ = −(V_mov,i + w_g,i ẑ_arriba) · n_i − Σ_k W_k Γ_estela,k`. A (anillos) y W_k (filas de estela) son constantes: A se factoriza una vez y los W_k se calculan una vez.
   - Cargas con Kutta–Joukowski no estacionario linealizado (Katz y Plotkin, ec. 13.150): `ΔF_ij = ρ [V∞ (Γ_ij − Γ_i−1,j) Δb_ij + (∂Γ_ij/∂t) ΔS_ij] n_ij`, con la derivada temporal por diferencia hacia atrás.
   - Opción **casi estacionaria** (VLM de herraduras en cada instante, sin memoria de estela) para ver cuánto alivia la carga la aerodinámica no estacionaria. Es la que usa el caso de validación 4.
3. **Mecánica de vuelo**: sólido rígido con movimiento longitudinal de dos grados de libertad, vertical y cabeceo, a velocidad de avance constante. Son perturbaciones sobre vuelo recto y nivelado a 1 g (Wright y Cooper, cap. 14 y 16):
   `m z̈ = −ΔL`, `I_yy θ̈ = ΔM_CG`, con el lavado normal por movimiento en cada panel `v_arriba,i = V θ + ż − q (x_i − x_CG) + w_g,i`.
   - m, I_yy y CG salen del modelo de masas, con su procedencia y su incertidumbre.
   - Integración implícita (trapecio) del sistema lineal conjunto de aerodinámica y movimiento. Es estable aunque el ala sea ligera frente a la masa aparente del aire.
   - `Δn = ΔL / (m g)` (positivo hacia arriba).
4. **Estado a 1 g**: `CL_1g = m g / (½ ρ V² S)`. El VLM estacionario da α_1g y la carga en envergadura a 1 g. Como aún no hay superficies de mando, si Cm(α_1g) ≠ 0 la app avisa «sin trimar: el diseño necesita mandos para volar a este CL» y solo se analizan los incrementos.
5. **Flexión**: cada semiala como viga de Euler–Bernoulli empotrada en el plano de simetría, cargada de forma casi estática en cada instante con la carga neta por unidad de envergadura `q(y, t) = ℓ_aero(y, t) − n(t) m'(y) g` (alivio inercial; Wright y Cooper, cap. 18; Megson, *Aircraft Structures for Engineering Students*, 6.ª ed., 2017, cap. 16):
   - `M_x(y) = ∫_y^{b/2} q(η) (η − y) dη`.
   - Tensión de una placa maciza de cuerda c y espesor t: `σ = 6 M_x / (c t²)`.
   - Flecha: `w'' = M_x / (E I)` con `I = c t³ / 12`, `w(0) = w'(0) = 0`.
   - Primera frecuencia de flexión de la semiala (viga en voladizo) para saber si el cálculo casi estático vale.
   - `ℓ_aero` sale de las franjas del VLM; `m'(y)` de la masa por área del ala (si no la das, no hay alivio inercial: resultado conservador y así etiquetado).

## Datos que necesito de ti (no se inventan)

- **Módulo E** y **resistencia a flexión** de tu tablero: los mides con el ensayo de voladizo del módulo de fabricación (§5.2) o los tomas de la ficha de tu marca, con su procedencia. Sin E no se calcula la flecha; sin resistencia no hay coeficiente de seguridad. El momento y la tensión sí salen sin ellos.
- **Masa por área del ala** (pesa el ala o una muestra de la plancha, §5.1) para el alivio inercial.

## Entradas

Diseño con al menos una superficie Ala horizontal; V (m/s); aire de la barra superior; masa, CG e I_yy del modelo de masas; ráfaga (U_ds, H, sentido); modo no estacionario o casi estacionario; material del ala (E, resistencia y masa por área, cada uno con su procedencia).

## Salidas (CALCULADAS, con método y supuestos)

Gráficas frente al tiempo de w_g en el morro, n, ΔL, α efectivo, θ, q, M_x en la raíz, σ_max y δ en punta; máximos con su instante; barrido n_max(H) y M_x,max(H); visor 3D con la banda de la ráfaga coloreada por w_g y el ala deformada coloreada por desplazamiento (escala real o exagerada, rotulada); CSV.

## Supuestos (se muestran en la app)

- Flujo potencial, sin pérdida. Si `α_1g + Δα_max` pasa de 10° la app lo marca en rojo: la ráfaga mete el ala en pérdida y la carga real queda limitada por ella (no modelada).
- Velocidad de avance constante, solo movimiento longitudinal (las ráfagas laterales y el balanceo llegan con el 6DOF). Sin mandos: avión libre, sin controladora.
- Estela plana y congelada (pequeñas perturbaciones).
- Cuerpo rígido para la mecánica de vuelo. La flexión se calcula en un solo sentido, de cargas a deformación: la deformación no cambia las cargas (sin aeroelasticidad) y no hay dinámica estructural.
- Placa maciza sin torsión: un ala con vaciados es menos rígida (ámbar) y en un ala con flecha el acoplamiento flexión-torsión descarga la punta (no modelado, ámbar).

## Rango de validez y semáforo

| Magnitud | Verde | Ámbar | Rojo |
|---|---|---|---|
| α_1g + Δα_max | ≤ 5° | 5–10° | > 10°: pérdida probable |
| Margen estático (del túnel) | > 0 | — | ≤ 0: inestable, la respuesta diverge |
| δ_punta / (b/2) | ≤ 5 % | 5–10 % | > 10 %: fuera de la viga lineal; la deformación cambiaría las cargas |
| Paso de la ráfaga 2H/V frente al periodo de flexión T₁ | 2H/V ≥ 3 T₁ | < 3 T₁: el ala vibra, la flecha dinámica puede ser mayor | — |
| Datos de material | MEDIDOS | de ficha (ESTIMADO) | sin dato: no se calcula |

## Casos de validación (tests con tolerancia explícita)

1. **Arranque brusco (función de Wagner en 3D)**: alas elípticas planas de AR 3 y 6 frente a las aproximaciones de R. T. Jones (NACA Report 681, 1940), `CL/CL∞ = 1 − 0,283 e^(−0,540 τ)` (AR 3) y `1 − 0,361 e^(−0,381 τ)` (AR 6), con τ = 2Vt/c. Tolerancia ±5 % para τ entre 2 y 30. La cuerda de referencia se toma tal como la define el informe original, que comprobaré al programar (Berci y Righi, arXiv:2001.06734, 2020, reproducen esos coeficientes con CFD).
2. **Ráfaga de escalón (función de Küssner)**: ala rectangular de AR 40, cerca del caso 2D, frente a `ψ(τ) = 1 − 0,5 e^(−0,13 τ) − 0,5 e^(−τ)` (Sears y Sparks, 1941; Bisplinghoff, Ashley y Halfman, *Aeroelasticity*, 1955, §5-7). Tolerancia ±6 % para τ entre 2 y 30.
3. **Límite estacionario**: tras un escalón de α, CL y Cm finales frente al VLM estacionario ya validado: CL dentro del 0,5 % y Cm dentro de 0,002.
4. **Solo vertical, casi estacionario**: la respuesta a una ráfaga 1−cos tiene solución analítica (ecuación de primer orden en ż). Error relativo del integrador < 1·10⁻⁶.
5. **Fórmula de Pratt–Walker** (NACA Report 1206, 1954): solo vertical, no estacionario, ala rectangular de AR 6, H = 12,5 c̄, con `μ_g = 2 (W/S) / (ρ c̄ a g)` = 10, 20, 50 y 100. El cociente Δn_max / Δn_estático frente a `K_g = 0,88 μ_g / (5,3 + μ_g)`, ±10 % (K_g es un ajuste de ingeniería).
6. **Viga**: voladizo con carga uniforme, `M_raíz = q L²/2` y `δ = q L⁴ / (8 E I)`; carga elíptica, `M_raíz = L_semiala · 4 (b/2) / (3π)`; placa con estrechamiento frente a cuadratura fina. Todo dentro del ±0,5 %.
7. **Frecuencia** de una placa uniforme en voladizo frente a `f₁ = (1,875² / 2π) √(E I / (m' L⁴))`, ±0,5 %.
8. **Simetría**: un ala simétrica con ráfaga vertical da balanceo y guiñada nulos (≤ 1·10⁻¹²).

## Rendimiento

En el Web Worker, TypeScript. Con unos 300 paneles y 100 filas de estela, cada paso cuesta una sustitución de la factorización más unos 1,5 M multiplicaciones: 1000 pasos en 1 o 2 s. El barrido de 20 longitudes de ráfaga tarda unos 30 s y se puede cancelar.

## En la app

Una pestaña **Ráfaga** dentro del túnel, con la ráfaga, el modo, el material y el barrido; gráficas apiladas en el tiempo con el máximo marcado; visor 3D como en la imagen de referencia; tabla con semáforo, método y referencias a un clic.

## Fuera de esta entrega

Ráfagas laterales y turbulencia continua de Dryden (llegan con el 6DOF), multirrotores, controladora, aeroelasticidad (la deformación realimentando las cargas), dinámica estructural, torsión, alas de costillas y larguero.

## Decisiones que te pido (cambian resultados)

1. Ráfaga por defecto: **U_ds = 2 m/s hacia arriba y H = 12,5 c̄** (la distancia de gradiente de Pratt y Walker). Es un escenario, no un coeficiente: con un dron a 15 m/s, 2 m/s ya son 7,6° de α, así que una ráfaga mayor mete en pérdida casi cualquier ala de placa y la app lo marcará en rojo.
2. VLM no estacionario como modo por defecto, con el casi estacionario disponible para comparar.
3. Sin alivio inercial hasta que des la masa por área del ala (resultado conservador).
4. Tolerancias de los casos 1 a 8 tal como están arriba. Si alguna no se cumple, te la traigo con datos.

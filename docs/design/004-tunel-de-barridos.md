# Mini-diseño 004 · Túnel de barridos (VLM + resistencia por componentes)

Estado: **aprobado** (31-10-2026) por mupsim, con el semáforo de α propuesto (verde ≤ 5°, ámbar ≤ 10°, rojo > 10°).

Adelanta dos cosas de la hoja de ruta: el **VLM de ala plana** (PoC, puerta 1) y el **túnel de barridos** (MVP, nivel 1 de la sección 10 de la especificación). Es la primera pieza que predice si un diseño vuela.

## Qué responde

Para el diseño tal como está dibujado y pesado: CL, CD, Cm y L/D frente a α; punto neutro y margen estático con el CG del modelo de masas; distribución de sustentación en envergadura frente a la elíptica; las seis componentes de la balanza (Fx, Fy, Fz en N; L, M, N en N·m) respecto al CG; y un mapa de ΔCp sobre las superficies sustentadoras.

## Métodos y referencias

1. **Red de vórtices en herradura (VLM)** sobre la superficie media de cada superficie sustentadora: segmento ligado en el 1/4 de cada panel, punto de control en el 3/4, patas libres paralelas a x cuerpo hacia atrás hasta el infinito. Condición de no penetración en cada punto de control:
   `Σ_j A_ij Γ_j = −V∞ · n_i`, con `A_ij` la velocidad normal inducida en i por la herradura j de circulación unidad (Biot–Savart).
   Referencias: Katz y Plotkin, *Low-Speed Aerodynamics*, 2.ª ed., §12.2–12.3; Bertin y Cummings, *Aerodynamics for Engineers*, §7.4.
2. **Sustentación y momentos**: Kutta–Joukowski en cada segmento ligado, `F_j = ρ Γ_j (V_j × l_j)`, con `V_j` = V∞ + velocidad inducida por las demás herraduras en el punto medio del segmento. Momentos respecto al CG.
3. **Resistencia inducida en el plano de Trefftz**: `D_i = ½ ρ Σ_j Γ_j w_j Δs_j`, con `w_j` la velocidad normal inducida por las patas libres en el plano de Trefftz. Más fiable que el campo cercano. Referencia: Drela, *Flight Vehicle Aerodynamics*, §5.5 y §6.
4. **Resistencia parásita por componentes** (Raymer, *Aircraft Design*, §12.5):
   `CD0 = Σ_c (Cf_c · FF_c · Q_c · S_wet,c) / S_ref + Σ_b (D/q)_b / S_ref`
   - Fricción de placa plana lisa: laminar de Blasius `Cf = 1,328 / √Re`; turbulenta de Prandtl–Schlichting `Cf = 0,455 / (log₁₀ Re)^2,58`. Transición en `Re = 5·10⁵` (placa lisa, supuesto).
   - Superficie mojada de una placa de espesor t: 2 × área en planta + perímetro × t.
   - Factor de forma de perfil delgado `FF = 1 + 0,6/(x/c)_m · (t/c) + 100 (t/c)⁴` (Raymer ec. 12.30), con (x/c)_m = 0,5 en una placa plana.
   - Canto de las placas (borde romo frente al flujo): `(D/q) = Cd_canto · A_frontal`, con el Cd de cara plana de frente (1,28; NASA Glenn, ver mini-diseño 005). ESTIMADO.
   - Piezas romas (bloques del modelo de masas, piezas STL): `(D/q) = Cd · A_frontal` con el Cd por tipo de forma del mini-diseño 005. ESTIMADO.
   - Interferencia: factor Q = 1,0 por defecto, configurable y siempre visible. ESTIMADO.
5. **Aire**: densidad y viscosidad del módulo de atmósfera ya validado (ISA, Sutherland, humedad), con las condiciones de la barra superior.
6. **Punto neutro y margen estático**: `x_NP = x_ref + (dCm/dCL)·c̄` en ejes FRD (x hacia delante), con la pendiente por mínimos cuadrados en la zona lineal (|α| ≤ 5°) y el momento respecto al CG; `SM = (x_CG − x_NP)/c̄ = −dCm/dCL` (estable si el punto neutro queda detrás del CG). Cuerda media aerodinámica `c̄ = (2/S)∫c² dy` del propio mallado. *Corrección al programar:* la versión aprobada escribía `x_NP = x_ref − (dCm/dCL)·c̄`, que es la forma con x hacia atrás de los textos clásicos; en FRD el signo es +. El margen estático no cambia.

## Entradas

- Superficies sustentadoras: los elementos de tipo **Ala** de la planta (horizontales) y del perfil (derivas verticales), con su contorno, simetría y posición. Placas planas: sin curvatura, torsión ni diedro en esta entrega.
- Placas que no son ala, discos de hélice (ignorados, hélice parada), bloques del modelo de masas y piezas STL: solo resistencia parásita.
- Barrido: α de −4° a 14° en pasos de 1° (configurable), β = 0, velocidad V (m/s), aire de la barra superior, CG del modelo de masas.
- Mallado: Ns franjas en envergadura con espaciado coseno (por defecto 24 por semiala) × Nc = 6 paneles en cuerda.

## Salidas (todas CALCULADAS, con método y supuestos)

Tabla y gráficas CL–α, CD–CL, Cm–α, L/D–α; CLα, CL0, CD0, CDi, e (Oswald del VLM); x_NP, SM, c̄, S, b, AR; Re de cada superficie; balanza de 6 componentes; carga en envergadura; ΔCp por panel (mapa en 3D). Exportación CSV del barrido.

Sin ala dibujada (multirrotor): no hay coeficientes de sustentación; el túnel da fuerzas en N y CdA en m² del conjunto en avance.

## Supuestos (se muestran en la app)

- Flujo potencial, incompresible y estacionario; la estela es plana y sigue el eje x del cuerpo (ángulos pequeños). **No hay separación ni pérdida**: lo dice la UI.
- Placas planas sin espesor en el VLM; el espesor solo entra en la resistencia.
- Compresibilidad despreciada (M < 0,3).
- Sin efecto de las hélices (ni tracción ni estela) en esta entrega.
- Fricción de placa lisa; las placas cortadas en DM con cantos vivos tienen burbujas de separación a bajo Reynolds, así que la resistencia real será mayor.

## Rango de validez y semáforo (propuesta para que la decidas)

| Magnitud | Verde | Ámbar | Rojo |
|---|---|---|---|
| α (placa plana, bajo Re) | \|α\| ≤ 5° | 5° < \|α\| ≤ 10° | \|α\| > 10°: pérdida probable, no modelada |
| Mach | < 0,3 | — | ≥ 0,3 |
| Re de la superficie | 5·10⁴ – 5·10⁵ con laminar | 2·10⁴ – 5·10⁴ | < 2·10⁴ |
| CD0 | — | siempre (ESTIMADO hasta calibrar con ensayo) | — |

## Casos de validación (tests con tolerancia explícita)

1. **Ala elíptica plana, AR = 8**: `e = CL² / (π · AR · CDi)` entre 0,98 y 1,00; `CLα` frente a la teoría de línea sustentadora `2π / (1 + 2/AR)` dentro del 3 %. (Teoría de Prandtl; Anderson, *Fundamentals of Aerodynamics*, §5.3.)
2. **Alas rectangulares planas, AR = 2, 4, 6, 8 y 10**: `CLα` frente a la ecuación de Helmbold `2π·AR / (2 + √(AR² + 4))` dentro del 5 %; `e ≤ 1` siempre.
3. **Alas con flecha y estrechamiento**: `CLα` frente a la fórmula de DATCOM (Raymer ec. 12.6, con η = 1 para perfil delgado) dentro del 6 %: AR = 5 con 45° de flecha en el 1/4 de cuerda; y el ala volante de 800 mm de la plantilla.
4. **Centro aerodinámico** de un ala rectangular sin flecha en el 25 % ± 2 % de c̄.
5. **Simetría**: con β = 0, CY, Cl y Cn ≤ 1·10⁻¹²; un ala dibujada entera y otra dibujada como media ala con simetría dan lo mismo.
6. **Convergencia**: CL varía menos de un 1 % al doblar Ns.
7. **Fórmulas de fricción**: Blasius y Prandtl–Schlichting reproducen sus valores tabulados en Re = 10⁵ y 10⁶.

Validación experimental pendiente: alas de placa plana a bajo Reynolds de Pelletier y Mueller (2000), que el módulo de fabricación ya cita. Hasta transcribir sus datos, las alas de placa plana se quedan en ámbar fuera de la zona lineal.

## Rendimiento

TypeScript en el Web Worker. Con ~300 paneles, la matriz se factoriza una vez por geometría (no depende de α) y cada punto del barrido cuesta una sustitución: un barrido completo en menos de 0,5 s. No hace falta WASM todavía.

## Fuera de esta entrega

Perfiles con espesor y curvatura (XFOIL, v1), torsión y diedro, superficies de mando, derivadas en β, p, q, r, estela de hélices, CFD, comparación A/B.

## Lo que salió al validar (pendiente de tu aprobación)

Programado y validado el 31-10-2026. La implementación reproduce **exactamente** el ejemplo resuelto del libro de Bertin y Cummings (ej. 7.2: ala de AR 5 y 45° con 4×1 paneles, CL = 0,0601 α por grado; la app da 0,06011). Con el mallado fino por defecto (24 franjas coseno por semiala × 6 paneles en cuerda) tres tolerancias del mini-diseño no se cumplían tal como estaban escritas, y no las he aflojado en silencio:

| Caso | Pedido | Resultado | Motivo | Cambio propuesto (ya en los tests) |
|---|---|---|---|---|
| Ala elíptica AR 8, CLα | ±3 % frente a línea sustentadora 2π/(1+2/AR) | −4,0 % | La línea sustentadora ignora la cuerda y sobreestima la pendiente de una superficie sustentadora a AR moderado | Comparar con Helmbold (aproximación de superficie sustentadora para alas elípticas) a ±2 %: da −1,6 %. La línea sustentadora queda como cota superior |
| Ala elíptica AR 8, e | 0,98 ≤ e ≤ 1,00 | 1,004 | La suma de Trefftz sobre la circulación escalonada del VLM subestima la inducida un 0,4 % con 48 franjas (comprobado con una carga elíptica exacta) | 0,98 ≤ e ≤ 1,005; se interpola la circulación en 8 subfranjas por franja (de 2,5 % a 0,4 % de error) |
| Alas rectangulares AR 2–10, CLα | ±5 % frente a Helmbold | −3 % a −6 % | Helmbold supone carga elíptica; una rectangular pierde pendiente por su carga no elíptica | ±7 % y nunca por encima de Helmbold |

Además: el centro aerodinámico al 25 % ± 2 % se cumple para AR ≥ 6 (a AR 2 está al 21 %, que es física: a bajo alargamiento el centro aerodinámico se adelanta); el test usa AR 6, 8 y 10. Con derivas de punta el factor de Oswald referido a la envergadura horizontal puede pasar de 1 (superficie no plana), y es correcto.

El L/D máximo se busca solo con |α| ≤ 10°: más allá la placa ha entrado en pérdida y el flujo potencial seguiría subiendo el L/D.

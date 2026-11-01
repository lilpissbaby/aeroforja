# Mini-diseño 006 · Túnel CFD (Lattice Boltzmann D3Q19 en WebGPU)

Estado: **propuesto** (01-11-2026), pendiente de aprobación. El adelanto lo decidió mupsim el 01-11-2026: es el nivel 2 de la sección 10 de la especificación, que estaba en la v2. Él eligió Lattice Boltzmann frente a un método de paneles 3D.

## Qué responde

Sobre el dron tal como está dibujado (placas y alas de las tres vistas, piezas STL y, si se marca, bloques del modelo de masas): cómo es el flujo alrededor del cuerpo 3D completo, dónde se separa, por dónde va la estela y qué presión hay en cada punto de la piel. Son las pruebas de las imágenes de referencia de mupsim:

1. **Mapa de Cp sobre toda la superficie del dron**, medio en el tiempo e instantáneo (imagen del coche coloreado).
2. **Cortes del campo** en planos x, y o z que se mueven con un deslizador: Cp, |u|/V∞ y vorticidad, con la rejilla de cálculo visible (imagen de Stallion 3D).
3. **Humo y líneas de corriente** desde un peine de emisión que se coloca delante del dron (imagen de las líneas de colores).
4. **Balanza de 6 componentes** media e historia en el tiempo (Fx, Fy, Fz en N; L, M, N en N·m respecto al CG), con el resultado del VLM al lado como contraste.

Lo que **no** responde: CD o CL con decimales. Con celdas de 3 a 15 mm la capa límite no se resuelve (especificación §10.3). Sirve para ver separación, estelas e interferencias y para comparar diseños entre sí.

## Por qué no hay corte de densidad

La imagen de Stallion 3D colorea densidad porque el flujo es supersónico y la densidad marca las ondas de choque. A la velocidad de un dron la densidad apenas cambia: en el punto de remanso ρ₀/ρ∞ = (1 + 0,2 M²)^2,5 ≈ 1 + M²/2, y a 20 m/s (M = 0,059) la diferencia es del 0,17 %. El corte saldría de un solo color. En Lattice Boltzmann la «densidad» de la red es la presión (p = c_s² ρ), así que el corte que corresponde es el de Cp, y es el que se muestra.

## Métodos y referencias

1. **Lattice Boltzmann D3Q19** (Qian, d'Humières y Lallemand, *Europhys. Lett.* 17, 1992; Krüger et al., *The Lattice Boltzmann Method*, Springer, 2017, cap. 3–4). En unidades de red (Δx = Δt = 1):
   - Transporte: `f_i(x + c_i, t + 1) = f_i*(x, t)` (esquema *pull*, un solo kernel fusionado de transporte y colisión).
   - Momentos: `ρ = Σ f_i`, `ρu = Σ c_i f_i`.
   - Equilibrio: `f_i^eq = w_i ρ [1 + (c_i·u)/c_s² + (c_i·u)²/(2c_s⁴) − u²/(2c_s²)]`, `c_s² = 1/3`.
2. **Colisión BGK regularizada** (Latt y Chopard, *Math. Comput. Simul.* 72, 2006):
   `f_i* = f_i^eq + (1 − 1/τ_eff) f_i^(1)`, con `f_i^(1) = w_i/(2c_s⁴) · Q_i : Π^neq`, `Q_i = c_i c_i − c_s² I`, `Π^neq = Σ c_i c_i (f_i − f_i^eq)`.
   Filtra los modos fantasma que hacen inestable al BGK simple con τ cerca de ½, que es donde cae un dron (Re ~ 10⁵).
3. **LES de Smagorinsky en LBM** (Hou, Sterling, Chen y Doolen, *Fields Inst. Commun.* 6, 1996; constante de Lilly, 1967; Pope, *Turbulent Flows*, 2000, §13.4):
   `τ_eff = ½ [τ₀ + √(τ₀² + 18√2 · C_s² · ‖Π^neq‖ / ρ)]`, con `‖Π^neq‖ = √(Π^neq_αβ Π^neq_αβ)` y `C_s = 0,17` (configurable; 0 apaga el modelo).
4. **Distribuciones desplazadas en FP32** (*DDF-shifting*; Skordos, *Phys. Rev. E* 48, 1993; Lehmann et al., *Phys. Rev. E* 106, 015308, 2022): se guarda `f_i − w_i`, y así el redondeo de FP32 queda casi al nivel de FP64 con la mitad de memoria.
5. **Bordes**
   - Sólido: rebote a mitad de enlace (*half-way bounce-back*; Ladd, *J. Fluid Mech.* 271, 1994; Krüger §5.2.3). Pared fija sin deslizamiento, en escalera de vóxeles.
   - Entrada y caras laterales, superior e inferior: equilibrio de corriente libre `f_i = f_i^eq(ρ∞ = 1, u∞)` (Krüger §5.3).
   - Salida: equilibrio con `ρ = 1` y la velocidad copiada de la celda anterior (gradiente nulo).
6. **Fuerzas por intercambio de momento** (Ladd 1994; Mei, Yu, Shyy y Luo, *Phys. Rev. E* 65, 041203, 2002): en cada enlace fluido–sólido, `ΔF = 2 c_i f_i*(x_f, t)` (pared fija), sumado sobre todos los enlaces del dron; momentos con el punto medio del enlace respecto al CG. Se usa la f completa (sin desplazar).
7. **Presión en la piel**: `Cp = c_s² (ρ − 1) / (½ U_lat²)`. Se interpola en cada vértice de la malla del dron, desplazado una celda hacia fuera por su normal, con interpolación trilineal que solo pesa celdas de fluido. Media temporal acumulada en la GPU.
8. **Humo y líneas de corriente**: el humo son partículas trazadoras sin masa, soltadas de forma continua desde el peine y movidas con el campo instantáneo (Runge–Kutta 2 e interpolación trilineal en la GPU), es decir, líneas de traza como las de un túnel con humo. Las líneas de corriente se integran con RK4 sobre el campo medio desde las mismas semillas, coloreadas por |u| o por Cp.
9. **Unidades** (SI en la entrada y la salida; unidades de red solo dentro del kernel):
   `Δx = tamaño de celda (m)`, `U_lat = 0,05` (Ma de red 0,087), `Δt = U_lat Δx / V∞`, `ν_lat = ν Δt / Δx²`, `τ₀ = 3 ν_lat + ½`, `F = F_lat · ρ Δx⁴ / Δt²`.
   El Reynolds físico se conserva: ρ y ν salen del módulo de atmósfera (ISA, Sutherland, humedad), con las condiciones de la barra superior.

## Dominio, rejilla y geometría

- **Cuerpo fijo y alineado con la rejilla**; la corriente entra con α y β: `u∞ = −V (cos α cos β, sin β, sin α cos β)` en ejes cuerpo FRD. Así las placas de las tres vistas quedan paralelas a los planos de la rejilla y su cara plana es exacta, sin escalones.
- **Caja**: con L = la mayor dimensión del dron en planta, 0,5 L delante, 2 L detrás, 0,5 L a cada lado y 0,6 L arriba y abajo.
- **Celdas**: presupuesto de 2 M por defecto («rápida» 0,5 M; «fina» 8 M si la GPU tiene memoria). Δx sale del volumen de la caja.
  - Quad de 5": caja de 0,99 × 0,57 × 0,40 m, Δx ≈ 4,8 mm con 2 M (8 mm de brazo ≈ 2 celdas).
  - Ala volante de 800 mm: caja de 2,34 × 1,60 × 1,04 m, Δx ≈ 12,5 mm con 2 M (16 celdas en la cuerda media) y 7,9 mm con 8 M (25 celdas).
- **Voxelización**: una celda es sólida si su centro queda dentro de alguna pieza cerrada (paridad de rayos en x, pieza a pieza y unidas) o si la corta un triángulo (prueba de solapamiento triángulo–caja de Akenine-Möller, *J. Graph. Tools* 6, 2001). Así una placa más fina que Δx no desaparece, pero queda **engrosada** a una celda. La app muestra el espesor representado frente al real.
- **Geometría**: los mismos sólidos cerrados que exporta el STL del dibujo (`planform/mesh.ts`), las piezas STL colocadas y, si se marca, los bloques del modelo de masas. Los discos de hélice no entran.
- **Tiempo**: se simulan 3 pasos de la corriente por la caja. Los 2 primeros son transitorio (sale el torbellino de arranque) y el último sirve para promediar fuerzas y Cp. Se puede alargar.

## Entradas

Geometría del dron; V∞ (m/s), α y β (°); aire de la barra superior; CG del modelo de masas; presupuesto de celdas; C_s; duración y ventana de promedio; posición del peine de humo y de los cortes.

## Salidas (todas CALCULADAS, con método y supuestos a un clic)

- Mapa de Cp medio e instantáneo sobre el dron, con escala de color y unidades.
- Cortes de Cp, |u|/V∞ y vorticidad |ω|·c̄/V∞, con la rejilla visible.
- Humo animado y líneas de corriente.
- Balanza media de 6 componentes, CD, CL, CY, Cl, Cm y Cn con la S_ref, c̄ y b del túnel, y su historia en el tiempo. CL del VLM al mismo α al lado.
- Datos de la malla: Δx, celdas, celdas por cuerda media y por pieza, espesor representado de cada placa, bloqueo y MLUPS de tu GPU.
- CSV de la historia de fuerzas y PNG de la vista.

## Supuestos (se muestran en la app)

- Casi incompresible: la red trabaja a Ma 0,087, con un error de compresibilidad del orden de Ma² ≈ 1 %.
- LES sin modelo de pared: la capa límite no se resuelve, y la transición y las burbujas laminares no se modelan. La separación en cantos vivos (placas de DM) sí aparece, porque la fija la geometría.
- Geometría en escalera de vóxeles. Las placas alineadas con la rejilla son exactas en su plano y se engrosan a Δx si son más finas.
- **Hélices paradas y no modeladas.** En un multirrotor en vuelo el flujo lo dominan las estelas de los rotores; la app lo avisa en ámbar. El disco actuador llegará con la propulsión.
- Corriente libre sin turbulencia; caja finita con bordes de equilibrio, con el bloqueo informado.
- Cuerpo rígido y fijo.

## Rango de validez y semáforo

| Magnitud | Verde | Ámbar | Rojo |
|---|---|---|---|
| Fuerzas y coeficientes | nunca en esta entrega | siempre (semicuantitativo) | si alguna fila de abajo está en rojo |
| Celdas por cuerda media (o por la dimensión menor de una pieza STL) | — | ≥ 8 | < 8 |
| Bloqueo A_frontal / A_sección | ≤ 2 % | 2–5 % | > 5 % |
| Ma de red | 0,087 fijo | — | — |
| Estabilidad | — | — | NaN o \|u\| > 0,3 en red: se detiene y lo dice |
| Ventana de promedio | ≥ 1 paso de la corriente por la caja | más corta | — |
| Placas engrosadas (Δx > 2 t) | — | se avisa con el factor | — |

El mapa de Cp y el humo son cualitativos: ámbar siempre.

## Casos de validación (tests con tolerancia explícita)

1. **Vórtice de Taylor–Green** 2D (64 × 64 × 1 periódico, Smagorinsky apagado): la energía cinética decae a ritmo `exp(−4 ν k² t)` con `ν = c_s²(τ − ½)`. Error del ritmo < 1 % con τ = 0,6, 0,8 y 1,0. Comprueba colisión y viscosidad. Con Smagorinsky encendido la energía decae más rápido, nunca más lento.
2. **Cilindro de Schäfer y Turek, caso 2D-1** (*Notes Numer. Fluid Mech.* 52, 1996; Re = 20; canal de 2,2 × 0,41 m con paredes, entrada parabólica, cilindro de D = 0,1 m en (0,2; 0,2)), con D = 20 celdas: CD frente a 5,57–5,59 dentro del ±5 %; Δp frente a 0,1172–0,1176 dentro del ±5 %. Comprueba paredes, entrada, salida y fuerza por intercambio de momento. Va en la CPU con la implementación de referencia y entra en la integración continua.
3. **Esfera a Re = 100**, con D = 10 a 16 celdas: CD frente a 1,087 (correlación de Clift, Grace y Weber, *Bubbles, Drops, and Particles*, 1978, para 20 < Re ≤ 260; coincide con la simulación directa de Johnson y Patel, *J. Fluid Mech.* 378, 1999) dentro del ±6 %. Es demasiado lento para la integración continua: va como script y como botón «Validar en tu GPU».
4. **GPU = CPU**: el kernel WGSL frente a la implementación de referencia en TypeScript, en una rejilla de 24 × 16 × 16 con un obstáculo, todos los bordes y Smagorinsky encendido, durante 300 pasos. Diferencia máxima < 1·10⁻⁵ en u y < 1·10⁻⁶ en ρ (unidades de red). Corre en Chromium sin pantalla con el adaptador WebGPU por software (SwiftShader), que he comprobado que funciona en mi entorno.
5. **Corriente uniforme sin cuerpo**: tras 1000 pasos sigue uniforme a precisión de máquina.
6. **Unidades y voxelización**: conversiones de ida y vuelta exactas; Re conservado; un cubo alineado da su volumen exacto; una esfera queda dentro de ± (área · Δx/2); una placa de 3 mm con Δx = 8 mm aparece entera con una celda de espesor.
7. **A Reynolds de dron** (en tu GPU, no en la integración continua): esfera y cilindro a Re = 1·10⁵ frente a las curvas clásicas (Achenbach, *J. Fluid Mech.* 54, 1972: esfera CD ≈ 0,47; cilindro CD ≈ 1,2), ±25 %. Si pasan, la app etiqueta las fuerzas como «ámbar, contrastado a Re comparable». Si no, «ámbar, sin contrastar». Verde nunca en esta entrega.

## Rendimiento y requisitos

- 2 M celdas × 19 × 4 B × 2 copias ≈ 304 MB de VRAM. Se piden al adaptador los límites que hagan falta; si no caben, la rejilla baja y la app lo dice.
- Un kernel fusionado por paso en un Web Worker con WebGPU. En una GPU de sobremesa, de 300 a 1500 MLUPS: el caso del ala volante con 2 M celdas (≈ 11 000 pasos) tarda entre 15 s y 1,5 min. El humo y los cortes se leen de la GPU cada pocos fotogramas, sin parar el cálculo.
- Requiere WebGPU (Chrome, Edge o Firefox en Windows). Sin WebGPU el banco lo dice y no se abre (especificación §5).
- Paquete `packages/cfd-webgpu` (como en la estructura de la especificación): kernels WGSL, implementación de referencia en TypeScript para validar, voxelizador y conversión de unidades, puros y sin UI.

## En la app

Un banco nuevo, **Túnel CFD**, junto al túnel de barridos (la especificación §10 lo describe como el tercer banco del túnel). Tiene controles de V, α, β, celdas y duración; visor 3D con el dron coloreado por Cp, el plano de corte y el humo; leyenda de color con unidades (escala *turbo*); gráfica de fuerzas frente al tiempo; tabla con semáforo y método. Botón «Validar en tu GPU» para los casos 3 y 7.

## Fuera de esta entrega

Hélices (disco actuador, cuando exista la propulsión), refinamiento local de malla como el de Stallion 3D, modelo de pared, cuerpo en movimiento, comparación A/B y exportación del campo (VTK).

## Decisiones que te pido (cambian resultados)

1. Colisión BGK regularizada con Smagorinsky y C_s = 0,17.
2. Que las fuerzas del CFD no lleguen nunca a verde en esta entrega (ámbar como máximo, aun pasando el caso 7).
3. Tolerancias de los casos 1 a 7 tal como están arriba. Si al programar alguna no se cumple, no se afloja en silencio: te lo traigo con datos, como en el mini-diseño 004.
4. Caja (0,5 L delante, 2 L detrás, 0,5 L a los lados, 0,6 L arriba y abajo) y 2 M celdas por defecto.

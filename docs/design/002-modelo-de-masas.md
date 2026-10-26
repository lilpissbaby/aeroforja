# Mini-diseño 002 · Modelo de masas

Estado: **aprobado** (27-10-2026) e implementado en `packages/physics/src/mass/`.

## Método

Sólido rígido compuesto por componentes; inercia en el CG por el teorema de ejes paralelos (Steiner). Referencias: Goldstein, Poole y Safko, *Classical Mechanics*, cap. 5; convenciones de Stevens, Lewis y Johnson, *Aircraft Control and Simulation*; inercias de sólidos homogéneos de Meriam, Kraige y Bolton, *Engineering Mechanics: Dynamics*, apéndice D.

## Ecuaciones

- M = Σ mᵢ
- CG = Σ mᵢ rᵢ / M
- J_CG = Σ ( Rᵢ Jᵢ Rᵢᵀ + mᵢ ( |dᵢ|² 1 − dᵢ dᵢᵀ ) ), dᵢ = rᵢ − CG
- Momentos y ejes principales: rotaciones de Jacobi (Numerical Recipes, 3.ª ed., §11.1).
- Incertidumbre (GUM, JCGM 100:2008, primer orden, entradas independientes):
  - u²(M) = Σ u²(mᵢ)
  - u²(CG_k) = Σ [ ((r_ik − CG_k)/M)² u²(mᵢ) + (mᵢ/M)² u²(r_ik) ]

## Convenciones

- Ejes cuerpo FRD (x adelante, y derecha, z abajo) con origen en el punto de referencia declarado del aparato. Cada vector lleva su sistema de referencia también en tiempo de ejecución (`frame: "FRD"`), así que sobrevive a los archivos JSON del proyecto.
- Orientación de cada componente: cuaternión con el escalar primero, producto de Hamilton, de ejes del componente a ejes cuerpo.
- Productos de inercia definidos en positivo (Ixy = ∫xy dm) y tensor con signo menos fuera de la diagonal, como en Stevens-Lewis y Beard-McLain.

## Entradas por componente

Masa (kg) con procedencia y, si se conoce, incertidumbre típica; posición de su propio CG (m, FRD) con incertidumbre opcional; orientación opcional; e inercia propia, que puede ser:

| Tipo | Uso típico |
|---|---|
| `point` | Piezas pequeñas y densas |
| `box` | Batería, placas, controladora |
| `cylinder` | Motores, ruedas |
| `tube` | Brazos y largueros de carbono |
| `sphere` | Lastre |
| `given` | Tensor medido o de ficha (MEDIDO o ESTIMADO) |

Los valores medidos del aparato completo (masa, CG o tensor) sustituyen a los calculados y se marcan como MEDIDOS. Los calculados se conservan siempre en `fromComponents`, para comparar.

## Procedencia

Lo compuesto a partir de componentes es CALCULADO. Si alguna masa o algún tensor dado es ESTIMADO, el resultado es ESTIMADO. Lo medido del aparato completo es MEDIDO.

## Validez

Aquí no hay un régimen físico que acotar; las comprobaciones son de consistencia física del tensor final y de cada tensor dado:

- ningún momento principal negativo;
- desigualdad triangular de los momentos principales, I₁ + I₂ ≥ I₃.

Si alguna falla, el semáforo pasa a rojo con su motivo. Las entradas imposibles (masa ≤ 0, dimensiones ≤ 0, radio interior ≥ exterior, ids repetidos, vector en otro sistema de referencia, cuaternión no unitario) se rechazan con un error explicado, porque no hay nada que calcular con ellas.

## Validación

| Caso | Referencia | Tolerancia |
|---|---|---|
| Caja = rejilla de 20³ masas puntuales | Identidad exacta: Σ de centros de celda al cuadrado = continuo × (1 − 1/N²) | 1×10⁻¹² |
| Cilindro y tubo = anillos × ángulos × rodajas | Identidad exacta de la regla del punto medio sobre r³ | 1×10⁻¹² |
| Esfera = 400 discos cilíndricos | Convergencia O(1/N²) a 2/5·m·R² | 1×10⁻⁴ |
| Mancuerna | m·L²/2 | 1×10⁻¹² |
| Varilla girada 45° | Ixy = (I_transversal − I_axial)/2 > 0 | 1×10⁻¹² |
| Quad X de masas puntuales | Productos nulos; Izz = Ixx + Iyy (ejes perpendiculares) | 1×10⁻¹² |
| Traslación del conjunto | El CG se desplaza igual y el tensor no cambia | 1×10⁻¹¹ |
| Rotación del conjunto | J' = R J Rᵀ | 1×10⁻¹¹ |

Prueba de que los tests detectan errores: con el coeficiente del tubo cambiado (ro² − ri² en vez de ro² + ri²) falla el caso del tubo; con el signo de los productos cambiado falla el de rotación.

## Pendiente

- Incertidumbre de la inercia (Monte Carlo).
- Ayuda para el péndulo bifilar, I = m·g·d²·T² / (16·π²·L), con su validación, cuando entremos en la calibración del MVP.

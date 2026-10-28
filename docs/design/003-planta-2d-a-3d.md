# Nota de diseño 003 · Editor de planta y modelo 3D

Estado: **implementado** (28-10-2026) en `packages/app/src/planform/` y `packages/app/src/ui/planform/`. Es geometría, no un módulo físico: no calcula masas, fuerzas ni coeficientes, así que no pasa por la aprobación de mini-diseño. Adelanta a la PoC una parte del editor 2D del MVP a petición de mupsim (ver `docs/decisiones.md`).

## Qué hace

1. Dibujar la planta (vista desde arriba) en un plano cartesiano en milímetros, con el morro hacia arriba.
2. Convertir ese dibujo en un modelo 3D al momento: cada pieza es la extrusión de su contorno.
3. Sacar el modelo a taller: STL en mm (Z arriba) y SVG de cada plancha a escala 1:1 con regla de control de 50 mm.

## Convenciones

- Todo se guarda en SI (m) y en ejes cuerpo FRD, con el mismo origen que el modelo de masas.
- Pantalla: un punto (x, y) del cuerpo se dibuja en SVG en (1000·y, −1000·x) mm. Con x hacia arriba e y a la derecha, z entra en la pantalla: es la vista FRD desde arriba sin reflejar.
- Altura: `z` es la del plano medio de cada pieza (positiva hacia abajo); el espesor se reparte a partes iguales por encima y por debajo. En un disco de hélice, `z` es su plano de giro.
- STL: rotación de 180° alrededor de x, de FRD a (x adelante, y izquierda, z arriba), en mm. Es una rotación propia: las caras conservan su orientación.

## Elementos

| Tipo | Forma | En 3D |
|---|---|---|
| Placa | contorno o círculo | extrusión de su espesor |
| Ala | contorno o círculo | extrusión (placa plana); el VLM leerá estos contornos |
| Vaciado | contorno o círculo | recorta las placas y alas cuyo espesor contiene su z |
| Hélice | círculo | disco plano sin espesor |

Cada elemento puede ser simétrico: se añade su reflejo en y → −y.

## Del dibujo a las piezas

1. Las placas y alas con la misma z y el mismo espesor (al micrómetro) son una plancha.
2. En cada plancha se unen todos los contornos (y sus reflejos) y se restan los vaciados que la atraviesan. Operaciones booleanas de polígonos por el algoritmo de barrido de Martínez, Rueda y Feito (2009, *Computers & Geosciences* 35(6)), con la librería polygon-clipping (MIT). Se calculan en mm para que las tolerancias de la librería trabajen con números de orden 1–1000.
3. Cada pieza resultante (contorno exterior y agujeros) se extruye con three.js.
4. Los círculos se convierten en polígonos inscritos con error de cuerda ≤ 0,01 mm (24 a 1024 lados).

## Comprobaciones que hace la app

- Contornos con menos de 3 vértices, sin área (< 1 mm²) o que se cortan a sí mismos: error en rojo y fuera del 3D.
- Dos discos de hélice que se solapan en el mismo plano: error en rojo (las palas chocarían). A distinta altura: aviso ámbar, porque el disco no tiene espesor y la interferencia entre hélices no está modelada.
- Un disco que atraviesa una plancha: error en rojo (la hélice golpearía la estructura).
- Un vaciado que no recorta nada: aviso.

## Indicadores (CALCULADO, geometría)

Envergadura y longitud, área en planta (todas las planchas fundidas, sin vaciados), volumen de las piezas (área neta × espesor), superficie alar S de los elementos «ala» (sin descontar vaciados: se suponen entelados), alargamiento b²/S, cuerda media S/b, número y área de discos de hélice y distancia máxima entre ejes de rotor.

## Tests

`packages/app/test/planform.test.ts`, contra resultados exactos de geometría:

- Área, perímetro y centroide de un rectángulo; detección de autointersección.
- Error de cuerda de los círculos dentro de la tolerancia.
- Media ala en el eje + reflejo = una pieza de área 2× (0,08 m²) y A = 2.
- Placa de 100 × 100 mm con agujero de Ø 20 mm: área con error menor que perímetro × tolerancia; un vaciado a otra altura no recorta y avisa.
- Volumen del sólido extruido por el teorema de la divergencia = área × espesor (cerrado y con caras hacia fuera).
- Quad X de 220 mm: una sola pieza, 4 discos, 220 mm entre ejes; hélices grandes o a la altura de la placa dan error.
- Ala trapezoidal: S = (c_r + c_t)/2 · b, A = b²/S; delta: S = c_r · b / 2.
- STL: tamaño, número de triángulos, volumen y espesor en Z; SVG en mm con regla de control.
- Archivos: planta y proyecto v2 de ida y vuelta; un archivo v1 se abre con la planta vacía.

## Pendiente

- Masa de cada pieza: volumen × densidad medida del banco de materiales (módulo de fabricación). Necesita su mini-diseño y conecta la planta con el modelo de masas.
- Vistas lateral y frontal, cotas editables, restricciones y variantes (MVP).
- Compensación de kerf en el SVG, anidado por plancha y DXF (módulo de fabricación).
- Perfil real de ala (costillas) en lugar de placa plana (v1).

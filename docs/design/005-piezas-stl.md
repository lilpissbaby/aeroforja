# Mini-diseño 005 · Piezas importadas en STL

Estado: **aprobado** (31-10-2026) por mupsim: geometría, propiedades de masa de la malla y resistencia estimada.

## Qué hace

Traer un STL (por ejemplo, la montura de la cámara), colocarlo en el dron con posición, orientación y escala, verlo en todas las vistas y en 3D, y que cuente en:

- el **modelo de masas**: masa, CG e inercia de la pieza;
- el **túnel** (mini-diseño 004): su resistencia y el momento que crea respecto al CG.

## Geometría

- Lectura de STL binario y ASCII. Unidades de origen elegibles (mm por defecto, como exportan los laminadores) y detección de tamaños absurdos.
- Comprobación de malla cerrada y orientable: cada arista compartida por exactamente dos triángulos en sentidos opuestos. Si no, aviso y no se calculan volumen ni masa.
- Volumen, centroide y área por el teorema de la divergencia sobre tetraedros con vértice en el origen.
- Áreas proyectadas en x, y, z (frontal, lateral y en planta): unión booleana de los triángulos proyectados.

## Propiedades de masa

Método: integración exacta de un poliedro homogéneo descomponiéndolo en tetraedros con vértice en el origen. Para cada triángulo (a, b, c), con `A = [a b c]`:

- `V_t = det(A) / 6`
- covarianza `C_t = det(A) · A · Ĉ · Aᵀ`, con `Ĉ = (1/120)·[[2,1,1],[1,2,1],[1,1,2]]`
- `C = Σ C_t`, tensor de inercia respecto al origen `I = ρ (tr(C)·𝟙 − C)`; se traslada al CG con Steiner, como en el mini-diseño 002.

Referencias: Mirtich, B. (1996), *Fast and Accurate Computation of Polyhedral Mass Properties*, Journal of Graphics Tools 1(2); Tonon, F. (2004), *Explicit Exact Formulas for the 3-D Tetrahedron Inertia Tensor in Terms of its Vertex Coordinates*, J. Math. Stat. 1(1).

Masa de la pieza, por orden de preferencia:
1. **Pesada** en báscula: MEDIDA. La densidad se deduce como m / V.
2. **Volumen × densidad** del material: CALCULADA si la densidad es tuya medida, ESTIMADA si es de catálogo.

Supuesto: densidad uniforme. Vale para resina y piezas macizas; **no** para FDM con relleno, donde la app pide pesarla y avisa de que la inercia es aproximada.

Validación: un cubo y una caja girada y desplazada dan el tensor analítico con error < 10⁻¹²; un cilindro de N caras coincide con la fórmula del prisma regular; la suma de dos mallas iguales desplazadas cumple Steiner.

## Resistencia estimada

`(D/q) = Cd · A_frontal`, con el Cd según el tipo de forma que elijas para la pieza. La fuerza actúa en el centroide del área frontal, así que crea momento respecto al CG.

Valores transcritos de NASA Glenn Research Center, *Beginner's Guide to Aeronautics: Shape Effects on Drag* (ensayos en túnel subsónico, área frontal de referencia): cara plana de frente 1,28; cuerpo cilíndrico con morro 0,75; esfera 0,5 (extremo alto del rango 0,07–0,5, régimen subcrítico de las piezas pequeñas); morro de bala 0,295; carenado o perfil 0,045. Al transcribir, la tabla atribuida a Hoerner que circula en la web no se pudo verificar en texto, así que se usa esta fuente, citable y con su base de referencia explícita.

- Siempre **ESTIMADA**, con una banda de ±40 % que se muestra.
- Los valores se transcriben de la fuente con su referencia exacta antes de programarlos, y se calibran con ensayos cuando los haya.
- No hay mapa de presiones sobre la pieza: eso es CFD (v2) y, aun así, solo sería comparativo.

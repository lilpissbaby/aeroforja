# AeroForja — Guía de fabricación y montaje

Versión 1 · 2026-11-06 · Tarjeta de Trello «1. Recolectar información de fabricación»

## 0. Qué es y cómo se usa

Es la base de conocimiento que Claude lee **antes de diseñar, partir en piezas o exportar** cualquier cosa de AeroForja. Recoge cómo se cortan, unen y montan las piezas con los materiales y las máquinas de mupsim. Complementa el PDF «AeroForja — Módulo de fabricación y materiales», que sigue siendo la fuente de verdad: si algo de aquí choca con él, manda el módulo y se avisa.

Procedencia de cada valor:

- **[n]**: sale de la fuente n de la lista final.
- **ESTIMADO**: práctica habitual de modelismo, o valor medido en otra máquina o con otro material.
- **MEDIR**: solo vale cuando lo midas en tu taller.

Incluso los valores con fuente son **valores de partida** hasta que hagas las pruebas de la sección 5 del módulo de fabricación (kerf, regleta de ranuras, pesaje). Medidas de piezas en mm; el núcleo de física sigue en SI.

---

## 1. El taller

| Máquina | Tipo | Área o volumen útil | Para qué | Límites |
|---|---|---|---|---|
| **Elegoo Mars 2 Pro** | Resina MSLA, LCD monocromo de 6″ (2560 × 1620), XY 50 µm [1] | **129 × 80 × 160 mm** [1] | Piezas pequeñas y precisas: horns, bisagras, adaptadores, pasadores, soportes de cámara | Volumen pequeño; resina frágil a impactos |
| **Kingroon KP5L** | FDM, extrusor directo, boquilla 0,4 mm, hasta 260 °C en boquilla y 100 °C en cama [2] | **300 × 300 × 330 mm** según ficha [2]. Tú dijiste unos 32 cm de lado: confirma la medida útil | Carcasas y tramos de fuselaje, bancadas, soportes, piezas grandes partidas | PLA, PETG, TPU y LW-PLA [2]. ABS sin cerramiento tiende a deformarse (ESTIMADO) |
| **«3032» con láser de diodo de 10 W** | Corte y grabado | Pendiente de confirmar. Por el nombre, unos 300 × 320 mm (ESTIMADO) | MDF y contrachapado de 3 mm, balsa, papel y cartulina (plantillas), grabado de etiquetas | No corta espumas de poliestireno, plásticos peligrosos ni acrílico transparente (sección 2) |
| **Mismo pórtico con husillo de 500 W** | Fresado CNC | La misma | MDF, contrachapado, espumas (XPS, Depron, EPS), ranuras a media profundidad, cajeados, avellanados | Carbono solo con muchas precauciones (sección 3) |

Datos que faltan de la 3032: modelo exacto y área útil; si los 10 W son de salida óptica o de consumo eléctrico; si tiene asistencia de aire; qué programa usas (LightBurn u otro); longitud de onda del módulo (para las gafas).

---

## 2. Qué material va a qué máquina

| Material | Láser 10 W | Husillo 500 W | Cuchilla | Otros |
|---|---|---|---|---|
| **DM (MDF) 3 mm** | **Sí**, con extracción. Un diodo de 10 W ópticos corta 3 mm en una pasada, con humo [3]. MEDIR con la carta de pruebas | Sí, con aspiración y mascarilla FFP3 [4] | No | — |
| **Contrachapado de chopo o abedul 3 mm** | **Sí**, el caso más fácil [3] | Sí | Difícil | 6 mm solo con asistencia de aire, en 3 a 5 pasadas [3] |
| **Balsa** | Sí (módulo §7) | Sí | Sí | — |
| **Cartón pluma** | **No**: núcleo de poliestireno (módulo §7) | Posible, pero el papel tiende a rasgarse (ESTIMADO, probar) | **Sí**, la técnica principal (sección 5.2) | — |
| **Corcho blanco (EPS, porexpán)** | **No**: se funde y prende (módulo §7) | Sí, con fresa afilada; suelta muchas perlas (ESTIMADO, probar) | Sí, con hoja larga y nueva | **Hilo caliente**: la técnica clásica para núcleos de ala [5] |
| **XPS y Depron** | **No** (módulo §7) | Sí (ESTIMADO, probar) | Sí | Hilo caliente [5] |
| **Plástico corrugado PP** | Con precaución (módulo §7) | — | Sí | — |
| **Placa y tubo de carbono** | **Prohibido** (módulo §7) | Solo con corte en húmedo o aspiración, y protección: el polvo conduce la electricidad y cortocircuita la electrónica, también la de la propia CNC [6] | No | Mejor comprarlo cortado, o sierra o disco con mascarilla |
| **PLA, LW-PLA, PETG, TPU** | Prohibido | — | — | KP5L |
| **Resina** | — | — | — | Mars 2 Pro |
| **PVC, vinilo, ABS, policarbonato de más de 1 mm, fibras con resina** | **Prohibido** (módulo §7) | — | — | — |
| **Acrílico transparente** | Un diodo azul no lo corta: la luz lo atraviesa [3] | Sí | — | — |

Idea a probar: el láser puede cortar en cartulina las plantillas del cartón pluma y la espuma, que salen rígidas y reutilizables para marcar con cuchilla (ESTIMADO).

---

## 3. Seguridad, en corto

- **Láser**: nunca cortando sin vigilancia; asistencia de aire y extracción encendidas; extintor a mano; si no sabes qué plástico es, no se corta (módulo §7). Gafas certificadas para la longitud de onda de tu módulo.
- **MDF**: el polvo de madera sensibiliza las vías respiratorias y el formaldehído está clasificado como cancerígeno. Usa extracción localizada, mascarilla FFP3 o filtro P3 (FFP1 y FFP2 no bastan) y limpia con aspirador HEPA, nunca soplando ni con cepillo. Si puedes, compra MDF E1 (< 0,1 ppm de formaldehído) o «sin formaldehído añadido» [4].
- **Carbono**: al cortarlo salen partículas de menos de 5 µm, y el polvo es conductor. Corta en húmedo o con aspiración, mascarilla P2 o P3 y gafas cerradas, y no quemes nunca los restos [6].
- **Resina**: guantes de nitrilo y ventilación; lava con alcohol isopropílico y cura con UV antes de tirar nada; nunca por el desagüe (ESTIMADO; sigue el manual de Elegoo).
- **Pegamentos**: el cianoacrilato y los sprays desprenden vapores, así que ventila [7].
- **Hilo caliente y espumas**: el humo del poliestireno también se ventila (ESTIMADO).

---

## 4. Materiales: qué aporta cada uno

La tabla de masas de catálogo está en el módulo §4. Aquí, lo que importa para montar:

- **El espesor real manda**: un usuario midió Depron «de 6 mm» entre 6,0 y 6,2 mm, y cartón pluma de Flite Test «de 5 mm» entre 5,2 y 5,3 mm [9]. AeroForja tiene que dimensionar ranuras y pliegues con el **espesor medido**, nunca con el nominal.
- **DM 3 mm**: rígido, barato, encola bien; pesado y frágil ante golpes y humedad (módulo §4). Para cuadernas, costillas, bancadas y frames pequeños, o aligerado y entelado.
- **Contrachapado**: más tenaz que el DM y mejor para bisagras vivas, que necesitan fibra (ESTIMADO, probar).
- **Cartón pluma**: el papel aporta la rigidez; pierde resistencia con la humedad (módulo §4).
- **EPS (corcho blanco)**: densidad muy variable según el tipo, de unos 10 a 35 kg/m³ (ESTIMADO): pésalo. No aguanta tornillos ni cargas puntuales; necesita puntos duros (5.3).
- **Resina estándar de Elegoo** [8]: densidad en líquido de 1,05 a 1,25 g/cm³; tracción 33,8 MPa; alargamiento a rotura 8,8 %; flexión 30,1 MPa; módulo de flexión 0,71 GPa; dureza Shore D 80–88. Pesa más que el PLA en piezas macizas; sirve para piezas pequeñas que no reciben golpes.
- **LW-PLA**: de 0,40 a 0,48 g/cm³ espumado al máximo (módulo §4); para aviones de pared fina (5.4).

---

## 5. Catálogo de uniones

### 5.1 Placas cortadas (MDF, contrachapado, balsa)

| Unión | Qué es | Dónde usarla | Reglas de partida |
|---|---|---|---|
| **Pestaña y ranura** | La pestaña de una pieza entra en una ranura pasante de la otra y la alinea sola | Cuadernas en el suelo del fuselaje, costillas en una placa, bancadas | Pestaña ≥ 2·t; ranura o agujero a ≥ 2·t del borde; ancho de ranura el de tu regleta (módulo §5 y §6) |
| **Dedos (finger joint)** | Dedos alternos en dos cantos que forman 90° | Caja de electrónica, bancadas, cajas de batería | Dedo 2·t y hueco 2·t por defecto [10] |
| **Media madera o cruce («egg-crate»)** | Dos ranuras hasta la mitad de la altura que se cruzan | Rejilla de costillas y larguero; brazos cruzados de un quad | Ranura hasta la mitad exacta; ancho el de la regleta |
| **Ranura en T con tuerca cautiva** | El tornillo atraviesa una placa y entra por el canto de la otra, donde una ranura en T aloja la tuerca | Uniones **desmontables** a 90°: brazos, tapas, bancadas | Es la forma seria de atornillar al canto de un DM de 3 mm, porque al canto de un tablero fino no se puede atornillar con fiabilidad [11]. Ranura = ancho de la tuerca más holgura (MEDIR) |
| **Encaje a presión** | Ajuste con interferencia, sin cola | Desmontables, o para sujetar mientras cura la cola | Pestaña = ranura + 2·kerf + 2·solape; solape en MDF de 0,05 a 0,10 mm por lado [12] (medido con un CO₂ de kerf ≈ 0,18 mm [12]). En tu diodo: MEDIR con la regleta. El MDF se desgasta si se monta y desmonta mucho (ESTIMADO) |
| **Cola de milano** | Dedos que se ensanchan y no se sueltan a tracción en el plano | Empalmar tramos de placa que no caben en el área del láser | Ángulo 50°, paso 3·t, profundidad 1,5·t, radio 0,2·t [10] |
| **Solape o doblador** | Las dos placas se solapan, o una placa extra se encola sobre la junta a uno o ambos lados | Alargar placas y reparar | Pone la cola a cortadura; mucho mejor que una junta a tope [14] |
| **Bisagra viva (lattice)** | Patrón de cortes que deja curvar la plancha | Morros y carenados curvos | Ancho de enlace = t; kerf ≥ 0,2 mm. Para 3 mm y 90°: n ≥ 23 enlaces, patrón de W = n·t = 69 mm, radio ≈ W/Θ ≈ 44 mm [15]. La fórmula del radio del artículo tiene un factor 2 que no cuadra con su propio ejemplo: usar W/Θ. Mejor en contrachapado que en MDF (ESTIMADO, probar) |
| **Pasadores o espigas** | Varilla de carbono, bambú o madera que atraviesa agujeros alineados de varias placas | Alinear capas y transmitir cortante | Agujero = varilla + holgura (MEDIR) (ESTIMADO) |
| **Tornillo pasante con tuerca** | Clásico, desmontable | Bancadas de motor, tren, fijación de ala | En DM: piloto del 85 al 95 % del diámetro del núcleo del tornillo y 1 mm más profundo; tornillos de cara a ≥ 12 mm del borde y a ≥ 25 mm de las esquinas; de canto, a ≥ 70 mm de las esquinas [11]. En piezas pequeñas de 3 mm casi nunca se cumple: tornillo pasante con tuerca, o inserto |

**Compensación de kerf**: contornos exteriores + kerf/2 e interiores − kerf/2, sin aplicarla dos veces si tu programa ya lo hace (módulo §6 y §10). Se compensa lo que corta el láser, no la medida que da el espesor de la plancha [13]. Antes de cada lote, mide el espesor con el calibre [12].

**Cola en placas**: cola blanca (PVA) para madera y DM (ESTIMADO, práctica); cianoacrilato válido en DM y balsa (módulo §3); epoxi para uniones con carbono y refuerzos.

### 5.2 Cartón pluma (espuma con papel)

- **Corte pasante**: tres pasadas: papel de arriba, espuma y papel de abajo [7]. Hoja afilada, cambiada en cuanto la espuma «engancha» [16]. Regla metálica con el corcho hacia arriba para cortar y hacia abajo para medir [7].
- **Marcado (score)**: corta el papel de arriba y algo de espuma, **nunca** el papel de abajo. Se dobla hacia el lado contrario al corte y el papel de abajo queda como bisagra [7].
- **Pliegue A (overlap fold)**: dos cortes paralelos separados un espesor de plancha (4–5 mm); se retira la tira de espuma dejando un papel, se dobla y se pega [7].
- **Pliegue B (bisel)**: bisel de 45° a cada lado del pliegue; se dobla hacia el corte hasta 90°, con cola caliente dentro. Las medidas hasta la línea son exteriores: el interior sale unos 5 mm menor [7].
- **Curvar**: se quita el papel de una cara y se enrolla la plancha contra la mesa [16].
- **Pegar**: cola caliente de **baja temperatura** [7]. El exceso se extiende con un retal, que refuerza y disipa el calor; los cantos expuestos se sellan con cola caliente para que el papel no se despegue [16]. **No** uses cianoacrilato normal, que derrite la espuma [7]. Sprays solo con ventilación [7]. La cinta de doble cara solo sirve en superficies planas, no en uniones a tope [7].
- **Refuerzos**: cinta de embalar transparente (sella, refuerza y deja una superficie lisa); cinta con fibra, con las fibras perpendiculares al corte; palillos o varillas que atraviesan capas o hacen de eje; varilla de carbono o madera como larguero en alas grandes [7]; laminar varias capas [16].
- **Láser**: hay quien corta cartón pluma con láser y la espuma se retrae un poco en el borde [9], pero el módulo lo marca como no recomendado por riesgo de incendio, así que **AeroForja no lo exporta al láser**.
- **Plantillas**: AeroForja genera un PDF a escala 1:1 para cuchilla (módulo §10). Para pasarlas a la plancha, un velo de spray o pinchar esquinas y líneas con un alfiler [7].

### 5.3 Espumas sin papel (EPS «corcho blanco», XPS, Depron)

- **Corte**: cuchilla larga y nueva. **Hilo caliente** para núcleos de ala, con plantillas de raíz y punta en chapa fina de aluminio, sujetas con alfileres; hilo de acero inoxidable y alimentación con una LiPo de 3S o 4S [5]. Perfiles clásicos: Clark Y (motorizados), RG15 (planeadores) y perfiles con reflex para alas volantes [5]. Husillo: posible (ESTIMADO, probar).
- **Pegar**:
  - **No**: cianoacrilato normal (ataca el poliestireno) [7], ni pegamentos, sprays o pinturas con disolvente salvo que digan aptos para poliestireno (ESTIMADO).
  - **Sí**: cianoacrilato «foam safe» para EPO, EPP, EPS y Depron [17]; UHU Por, un adhesivo para poliestireno [18]; epoxi (ESTIMADO, práctica habitual); cola caliente de baja temperatura (la de alta funde el EPS, ESTIMADO); pinturas al agua [7].
- **Puntos duros**: donde van tornillos, motor, servos o la fijación del ala, se pega una placa de contrachapado o DM, o una pieza impresa que reparta la carga. La espuma sola no aguanta cargas puntuales (ESTIMADO, práctica). Esto es clave para tus cuerpos baratos de porexpán con el «cerebro» intercambiable: la interfaz del módulo de electrónica tiene que ir a un punto duro.
- **Refuerzos**: larguero de carbono o madera embutido en una ranura (ESTIMADO), cinta de embalar o con fibra [7], film.

### 5.4 Piezas FDM (KP5L)

- **Holguras por lado**, de partida (valores de una Ultimaker S7 [20], una máquina más precisa que la tuya, así que ESTIMADO y MEDIR con una probeta):

  | Ajuste | Holgura por lado |
  |---|---|
  | A presión | 0,2 mm |
  | Pasador de alineación | 0,2 mm |
  | Desmontable | 0,3 mm |
  | Deslizante, bisagras | 0,3–0,4 mm |
  | Libre | ≥ 0,4 mm |
  | Agujero donde rosca el tornillo | 0 ± 0,1 mm respecto al tornillo |

- **Insertos roscados por calor**: soldador de 10 a 20 °C por encima de la temperatura de impresión (PLA ≈ 225 °C, PETG ≈ 245 °C). En agujero ciego, 1 mm más profundo que el inserto. Se mete el 90 % con calor y se termina a ras con una herramienta plana. El diámetro del agujero sale de la ficha del inserto y de una probeta: CNC Kitchen prueba de 4,0 a 4,4 mm para M3 [21]. Para tornillos que se aprietan y aflojan a menudo: tapas, bancadas, fijación de ala.
- **Tramos partidos**, cuando una pieza no cabe: cierres o llaves de alineación entre tramos, pasadores y varilla de carbono pasante. Se presentan **en seco**, se alinean y se pegan con cianoacrilato fino y activador [22]. El módulo pide además canales para varillas (§10).
- **No pegar lo que se cambia**: varillas del tren y ejes de bisagra van deslizados, sin cola, para poder sustituir alerones o servos [22].
- **Bisagras impresas**: nudillos con eje de varilla de carbono o acero de 0,8 a 1,2 mm, deslizado y sin cola [22]; holgura deslizante de 0,3 a 0,4 mm [20].
- **Fijación del ala**: tornillo de nylon M4 con una tuerca M4 metida en una ranura del fuselaje [22]. Un tornillo de nylon cede antes que la estructura en un golpe (ESTIMADO); las gomas elásticas son la alternativa clásica (ESTIMADO).
- **Clips (snap-fit) en voladizo** [23]:
  - Flecha admisible de un brazo de sección rectangular constante: y = 0,67·ε·l²/h. Si el espesor baja linealmente hasta la mitad en la punta: y = 1,09·ε·l²/h, con más flecha para el mismo esfuerzo.
  - La sección crítica es la raíz: radio de raíz ≥ 0,38 mm (0,015″).
  - Si se monta y desmonta a menudo, usar cerca del 60 % de la deformación admisible.
  - Fuerza de montaje: W = P·(µ + tan α)/(1 − µ·tan α).
  - La guía da ε = 4 % para PC y 2,5 % para PC/ABS. **PLA, PETG y resina no están**: ESTIMADO, probar con un clip de ensayo. Imprimir el clip con las capas a lo largo del brazo, porque la unión entre capas es la dirección débil (ESTIMADO).
- **LW-PLA para aviones de pared fina**: modo jarrón, multiplicador de extrusión 0,5, sin retracciones, de 220 a 260 °C (empieza a espumar hacia 230 °C), ventilador de capa apagado y cama a 55–60 °C [22]. La KP5L llega a 260 °C [2]. La espumación cambia con temperatura y flujo: probeta obligatoria (módulo §5).
- **Orientación**: las capas según la carga (módulo §6); la unión entre capas es la dirección débil (ESTIMADO).

### 5.5 Piezas de resina (Mars 2 Pro)

- **Para**: horns, bisagras pequeñas, adaptadores, soportes de cámara, pasadores, plantillas pequeñas de montaje. **No** para piezas que reciben golpes (módulo §4).
- **Reglas de diseño de partida** (Formlabs, Form 2 con resina Clear a 100 µm [24]: otra máquina, ESTIMADO):

  | Regla | Valor |
  |---|---|
  | Pared mínima | 0,4 mm |
  | Voladizo sin soporte | ≤ 3 mm, a ≥ 19° de la horizontal |
  | Relieve mínimo | 0,1 mm |
  | Grabado mínimo | 0,4 mm |
  | Agujero mínimo | 0,8 mm |
  | Holgura entre piezas | 0,5 mm |
  | Drenaje en piezas huecas | ≥ 3,5 mm de diámetro |
  | Pin vertical | 0,4 mm hasta 7 mm de alto |

- **Insertos en resina**: pegados con cianoacrilato, aguantaron 52 kg en un ensayo de CNC Kitchen [21].
- **Huecos**: con agujeros de drenaje, o la resina líquida queda atrapada dentro [24].

### 5.6 Uniones mecánicas y desmontables

- Tornillo pasante con tuerca; tornillo de nylon como fusible [22]; gomas elásticas; imanes para tapas; velcro y bridas para batería y electrónica (ESTIMADO); remaches y bridas en PP corrugado (módulo §4).
- **Electrónica de multirrotor**: los patrones de montaje habituales de controladora y ESC son 30,5 × 30,5 mm (M3), 20 × 20 mm (M2 o M3) y 25,5 × 25,5 mm (M2) (ESTIMADO, práctica del sector FPV): comprobar en la ficha de tu controladora.
- **Motores**: patrón y largo de tornillo de la ficha del motor. Un tornillo demasiado largo toca el bobinado (ESTIMADO, práctica).

### 5.7 Superficies de mando

Cada superficie de mando es una pieza aparte con su bisagra:

| Bisagra | Cómo | Para qué |
|---|---|---|
| De papel | Corte de marcado en cartón pluma (5.2) [7] | Aviones de cartón pluma |
| De cinta | Una tira de cinta transparente por arriba con el mando bajado del todo y otra por abajo con el mando subido del todo. Pierde adhesión con el tiempo: revisar a menudo [19] | Espumas |
| De lámina (CA hinge) | Rectángulo de plástico fibroso metido en ranuras y fijado con unas gotas de cianoacrilato [19] (en espuma, foam safe) | Balsa y espuma |
| De pivote | Dos piezas unidas por un eje, pegadas con epoxi y aseguradas con un palillo atravesado [19] | Aviones grandes |
| Termoadhesiva | Tiras de film de entelar; muy ligera y con un hueco mínimo entre superficie fija y móvil [19] | Eléctricos pequeños |
| Impresa | Nudillos con eje de varilla deslizado (5.4) [22] | Piezas impresas |
| Viva en PP | Corte de una sola pared en el corrugado (módulo §6) | PP corrugado |

- **Hueco de bisagra**: lo más pequeño posible. AeroForja simula el mando como si estuviera sellado; un hueco grande hace que el mando real sea menos eficaz que el simulado (ESTIMADO).
- **Mando**: varilla de acero de 0,8 a 1 mm con una Z en el servo [22].

---

## 6. Adhesivos: qué pega con qué

✔ = válido · ✖ = no · ? = sin dato: probar

| Adhesivo | Madera y DM | Cartón pluma | EPS, XPS, Depron | PLA y PETG | Resina | Carbono | PP corrugado |
|---|---|---|---|---|---|---|---|
| Cola blanca (PVA) | ✔ (ESTIMADO) | ✔ lento (ESTIMADO) | ✔ lento (ESTIMADO) | ✖ | ✖ | ✖ | ✖ |
| Cianoacrilato normal | ✔ | ✖ derrite [7] | ✖ derrite [7] | ✔ [22] | ✔ [21] | ✔ (ESTIMADO) | ✖ |
| Cianoacrilato foam safe | ✔ | ✔ | ✔ [17] | ✔ | ? | ? | ✖ |
| Epoxi | ✔ | ✔ | ✔ (ESTIMADO) | ✔ (ESTIMADO) | ✔ (ESTIMADO) | ✔ | ✖ (ESTIMADO) |
| Cola caliente de baja temperatura | ✔ | ✔ [7][16] | ✔ (ESTIMADO) | ✔ | ✔ | ? | ✔ (módulo §4) |
| UHU Por | ? | ✔ | ✔ [18] | ? | ? | ? | ? |
| Sprays y colas de contacto con disolvente | ✔ | Solo si dicen apto | ✖ salvo apto (ESTIMADO) | ? | ? | ? | ? |

**Masa de la unión**: el pegamento pesa. Se mide en gramos por metro de junta (módulo §5, prueba 6) y entra en el modelo de masas.

---

## 7. Uniones que aguantan

- **Cómo trabaja la cola**: aguanta bien a compresión y a cortadura, y mal al desgarro (cleavage) [14]. La unión a tope es la peor. Mejor un solape, un doble solape o un empalme biselado (scarf), que es la más fuerte. En esquinas, una pieza que pase el desgarro a cortadura o a compresión [14].
- **Área de cola** orientada según la carga, con pestañas que la lleven a cortadura.
- **Largueros continuos** a través de las juntas entre tramos, y juntas lejos de la zona de máximo momento (la raíz del ala), salvo que las cruce un larguero (ESTIMADO, principio estructural). El ensayo de flexión del ala de AeroForja (mini-diseño 007) sirve para localizar ese momento.
- **Cargas puntuales** (motor, tren, tornillos del ala) siempre a un punto duro que las reparta.
- **Para cada pieza, decidir**: unión **permanente**, **desmontable** o **fusible**. Una unión fusible es barata y cede antes que la estructura (tornillo de nylon, gomas) [22].
- **Montaje a prueba de errores**: encajes asimétricos, para que una pieza no entre del revés, y grabado de identificador, cara superior y dirección de fibra (módulo §10).
- **Holguras**, siempre a partir de tus medidas.

---

## 8. Cómo partir un dron en piezas (reglas para la tarjeta 2)

1. **Por función**: superficies de mando, bancada de motor, tapa de batería, bahía de electrónica (el «cerebro» intercambiable), tren y brazos de multirrotor, que se sustituyen tras un golpe.
2. **Por máquina**: cada pieza cabe con margen en el área o volumen de su máquina:
   - Resina: 129 × 80 × 160 mm.
   - FDM: 300 × 300 × 330 mm.
   - Láser y CNC: área por confirmar.

   Si no cabe, se parte por donde menos esfuerzo hay y se une con un empalme: cola de milano o doblador en placa (5.1), llaves y varilla en impresas (5.4).
3. **Por material y técnica constructiva** (módulo §6).
4. **Cada unión con su ficha**: tipo, holgura medida, adhesivo y masa añadida.
5. **Orden de montaje** sacado del grafo de ensamblaje, con plantilla de montaje cuando hay ángulos que fijar, como la torsión o el diedro (módulo §6).
6. **Presentar en seco** antes de pegar [22] y controles de peso por paso (módulo §10).

---

## 9. Pruebas pendientes en tu taller

- [ ] Regleta de ranuras y kerf en DM de 3 mm con el láser (módulo §5).
- [ ] Carta de potencia y velocidad del láser para DM, contrachapado y balsa (módulo §5).
- [ ] Probeta de holguras FDM en PLA y PETG: a presión, pasador y deslizante.
- [ ] Probeta de holguras en resina.
- [ ] Probeta de insertos M2 y M3 en la KP5L.
- [ ] Espesor real de cada plancha: cartón pluma, Depron, EPS.
- [ ] Gramos por metro de junta de cola caliente, cola blanca y cianoacrilato.
- [ ] Clip de ensayo en PLA y PETG para estimar la ε admisible.

## 10. Datos que faltan

- 3032: modelo, área útil, si los 10 W son ópticos o eléctricos, asistencia de aire, programa y longitud de onda.
- Corcho blanco: tipo (de embalaje o placa de aislamiento) y espesores.
- Cartón pluma: marca y espesor.
- Adhesivos que tienes en casa.

---

## Fuentes

Base: «AeroForja — Módulo de fabricación y materiales» (PDF del proyecto, fuente de verdad).

1. All3DP, especificaciones de la Elegoo Mars 2 Pro — https://all3dp.com/1/elegoo-mars-2-pro-review-3d-printer-specs/
2. All3DP, especificaciones de la Kingroon KP5L — https://all3dp.com/1/kingroon-kp5l-review-3d-printer-specs/
3. BlazeX Laser, límites reales de un diodo de 10 W (blog de fabricante, orientativo) — https://uk.blazexlaser.com/blogs/news/10w-diode-laser-how-thick-can-it-cut-real-limits
4. HSE (Reino Unido), preguntas frecuentes sobre el MDF — https://hse.gov.uk/woodworking/faq-mdf.htm
5. Flite Test, «Hotwire Template Tips» — https://www.flitetest.com/articles/hotwire-template-tips
6. UNSW, hoja de seguridad de la fibra de carbono — https://www.unsw.edu.au/content/dam/pdfs/unsw-adobe-websites/planning-assurance/safety/documents-resources/other/2018-05-UNSW-Carbon-fibre-safety-information-sheet.pdf
7. Fold-n-Fly, «Foam Board Tools & Techniques» — https://www.foldnfly.com/lounge/foam-core-tools-techniques.php
8. Elegoo, ficha técnica de la resina estándar — https://123-3d.nl/pdf/Elegoo_Standaard_Resin_TDS_EN.pdf
9. Model Engineer, foro, «CNC Depron machining + film» — https://www.model-engineer.co.uk/?p=29811
10. Boxes.py, documentación de cantos y uniones — https://boxes-audreyfeldroy.readthedocs.io/en/latest/api_edges.html
11. mdf-info.eu, atornillar en MDF — https://mdf-info.eu/using-mdf/fixing/screwing
12. UPenn MEAM, «Laser Cutting — Notes on Press Fits» — https://medesign.seas.upenn.edu/index.php/Guides/LaserCuttingFits
13. Cuttle, «Slots Best Practices» — https://cuttle.xyz/learn/slots-best-practices
14. 3M, «Designing Adhesive Joints for Less Stress» — https://www.3m.com/3M/en_US/bonding-and-assembly-us/resources/science-of-adhesion/less-stress-adhesive-joints
15. Deferred Procrastination (DefProc), «Minimum bend radius» de bisagras lattice — https://www.deferredprocrastination.co.uk/blog/2012/minimum-bend-radius/
16. Flite Test, «How to build anything with foam board» — https://flitetest.com/articles/how-to-build-anything-with-foam-board
17. Toemen Modelsport, cianoacrilato foam safe para EPO, EPP, EPS y Depron — https://www.toemen.nl/en/product/toemen-modelsport-ca-glue-foam-safe-special-schuimmaterialen-zoals-epo-epp-eps-en-depron-20g-pin-cap
18. Wheelspin Models, UHU Por, adhesivo apto para espuma — https://wheelspinmodels.co.uk/i/uhu-por-foam-safe-adhesive-50ml-313044/
19. Flite Test, «RC Plane Hinge Types» — https://flitetest.com/articles/RC_Plane_Hinge_Types
20. UAL Creative Computing Institute, holguras y tolerancias en FDM — https://wiki.cci.arts.ac.uk/books/digital-fabrication-lab/page/design-the-clearance-and-tolerance
21. CNC Kitchen, «Tips & Tricks for Heat-Set Inserts» — https://cnckitchen.com/blog/tips-and-tricks-for-heat-set-inserts
22. 3DLabPrint, guía de usuario del Albatros D.Va — https://3dlabprint.com/wp-content/uploads/2020/10/Albatros-DVa-user-guide.pdf
23. Bayer MaterialScience, «Snap-Fit Joints for Plastics — A Design Guide» — https://cdn.sparkfun.com/assets/home_page_posts/1/4/1/0/Plastic_Snap_fit_design.pdf
24. Formlabs, especificaciones de diseño para SLA — https://formlabs.com/support/Design-Specs/

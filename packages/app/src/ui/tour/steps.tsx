/**
 * The guided tour: one card per part of the workbench, in the order a new
 * builder meets them. Each step can set up the screen first (view, panel,
 * selection) so the part it explains is visible.
 */
import type { ReactNode } from "react";
import { useAppStore } from "../../state/store.ts";
import type { Side } from "./position.ts";

export interface TourStep {
  readonly id: string;
  /** Value of the data-tour attribute to highlight; null for a centred card. */
  readonly target: string | null;
  readonly sides?: readonly Side[];
  readonly title: string;
  readonly body: ReactNode;
  readonly prepare?: () => void;
}

const store = () => useAppStore.getState();

const showPlanform = (view: "plan" | "split" | "3d" | "three" | "tunnel" = "split") => {
  const s = store();
  if (s.panel !== "planform") s.setPanel("planform");
  if (s.view !== view) s.setView(view);
};

/** Selects a solid piece of the planform so the editing handles are on screen. */
const selectSomePlanElement = () => {
  showPlanform();
  const s = store();
  const current = s.planform.elements.find((e) => e.id === s.planSelectedId);
  if (current !== undefined) return;
  const pick =
    s.planform.elements.find((e) => e.role === "plate" && e.shape === "polygon") ??
    s.planform.elements.find((e) => e.role !== "rotor") ??
    s.planform.elements[0];
  s.selectPlanElement(pick?.id ?? null);
};

const Keys = ({ children }: { children: string }) => <kbd>{children}</kbd>;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Bienvenido a AeroForja",
    body: (
      <>
        <p>
          En unos minutos verás todo lo que puedes hacer ahora mismo: dibujar tu dron en planta, alzado y perfil, ver su
          modelo 3D al momento, montarle piezas STL, ensayarlo en el túnel de viento virtual, revisar cada resultado con su
          método y su procedencia, y sacar archivos para el taller. También puedes diseñarlo hablando con Claude.
        </p>
        <p>
          Avanza con <Keys>→</Keys> o «Siguiente», vuelve con <Keys>←</Keys> y sal con <Keys>Esc</Keys>. El tour no cambia
          tu diseño, solo lo que se ve; al terminar todo queda como estaba.
        </p>
      </>
    ),
    prepare: () => {
      showPlanform();
      store().selectPlanElement(null);
    },
  },
  {
    id: "project",
    target: "project",
    sides: ["bottom"],
    title: "Tu proyecto",
    body: (
      <p>
        Haz clic en el nombre para cambiarlo. Todo lo que haces se guarda solo en este navegador; para copias o para
        llevarlo a otro equipo, usa «Guardar JSON» en el panel izquierdo.
      </p>
    ),
  },
  {
    id: "air",
    target: "air",
    sides: ["bottom"],
    title: "Condiciones del aire",
    body: (
      <>
        <p>
          Altitud geométrica en metros, temperatura como diferencia con la atmósfera estándar (ISA + ΔT, en kelvin) y humedad
          relativa en %. Déjala vacía para aire seco.
        </p>
        <p>Densidad, viscosidad y velocidad del sonido salen en la pestaña «Aire» de abajo, con su método y su rango de validez.</p>
      </>
    ),
  },
  {
    id: "topbar-end",
    target: "topbar-end",
    sides: ["bottom", "left"],
    title: "Tour y tema",
    body: (
      <p>
        «Tour guiado» vuelve a abrir esta guía cuando quieras. A su lado eliges tema claro, oscuro o el de tu sistema; el
        plano y el 3D cambian de colores con él.
      </p>
    ),
  },
  {
    id: "left-tabs",
    target: "left-tabs",
    sides: ["right"],
    title: "Dibujo, piezas o masas",
    body: (
      <>
        <p>
          <b>Dibujo</b>: la geometría del aparato en sus tres vistas. <b>Piezas</b>: archivos STL que montas en el dron (una
          montura de cámara, una cúpula). <b>Masas</b>: los componentes con su peso, que dan la masa total, el centro de
          gravedad y la inercia.
        </p>
        <p>El panel de la derecha muestra las propiedades de lo que tengas seleccionado en cada pestaña.</p>
      </>
    ),
    prepare: () => showPlanform(),
  },
  {
    id: "plan-list",
    target: "plan-list",
    sides: ["right"],
    title: "Elementos del dibujo",
    body: (
      <>
        <p>
          Cada línea es un elemento: nombre, tipo (placa, ala, vaciado o hélice), «×2» si es simétrico, la vista en la que está
          dibujado y sus medidas principales. Haz clic para seleccionarlo.
        </p>
        <p>Un punto rojo delante del nombre indica que ese elemento tiene un error y no se construye.</p>
      </>
    ),
  },
  {
    id: "templates",
    target: "templates",
    sides: ["right"],
    title: "Plantillas paramétricas",
    body: (
      <>
        <p>
          <b>Frame de multirrotor</b>: 3, 4, 6 u 8 brazos en X o en +, distancia diagonal entre motores, ancho de brazo, placa
          central, bancadas, hélice en pulgadas, altura de la hélice y espesor.
        </p>
        <p>
          <b>Ala por parámetros</b>: envergadura, cuerdas, flecha, posición, espesor y derivas de punta (en el perfil), con
          puntos de partida de ala volante, delta y ala recta.
        </p>
        <p>«Sustituir planta» empieza de cero; «Añadir» lo suma a lo que tengas. Las dos cosas se deshacen con Ctrl+Z.</p>
      </>
    ),
  },
  {
    id: "view-switch",
    target: "view-switch",
    sides: ["bottom"],
    title: "Planta, perfil, alzado y 3D",
    body: (
      <>
        <p>
          <b>Planta</b> (desde arriba, x e y), <b>Perfil</b> (desde la derecha, x y z) y <b>Alzado</b> (desde delante, y y z)
          son tres planos cartesianos para dibujar. «Tres vistas + 3D» las pone juntas con el modelo; cada vista muestra en
          discontinuo lo dibujado en las otras dos, y puedes engancharte a sus esquinas para alinearlas.
        </p>
        <p>«Túnel de viento» ensaya el diseño. Lo que dibujas o seleccionas en una vista aparece al instante en las demás.</p>
      </>
    ),
    prepare: () => showPlanform("three"),
  },
  {
    id: "plan-toolbar",
    target: "plan-toolbar",
    sides: ["bottom", "right"],
    title: "Herramientas de dibujo",
    body: (
      <ul>
        <li>
          <b>Seleccionar</b> <Keys>V</Keys>, <b>Contorno</b> <Keys>P</Keys>, <b>Rectángulo</b> <Keys>R</Keys> y{" "}
          <b>Círculo</b> <Keys>C</Keys>.
        </li>
        <li>
          <b>Tipo</b>: qué será lo próximo que dibujes. Una hélice siempre es un círculo.
        </li>
        <li>
          <b>Simetría</b>: crea también su reflejo respecto al plano y = 0; al editar uno se edita el otro. En el perfil el
          reflejo es la pareja al otro lado (dos derivas).
        </li>
        <li>
          <b>Rejilla</b>: paso de ajuste. «auto» lo adapta al zoom; también 0,5 a 10 mm o sin ajuste.
        </li>
        <li>
          <b>Deshacer</b> <Keys>Ctrl+Z</Keys>, <b>Rehacer</b> <Keys>Ctrl+Y</Keys> y <b>Encuadrar</b> <Keys>F</Keys>.
        </li>
      </ul>
    ),
  },
  {
    id: "plan-canvas",
    target: "plan-canvas",
    sides: ["right", "bottom"],
    title: "El plano cartesiano",
    body: (
      <>
        <p>
          En la planta ves el dron desde arriba con el morro hacia arriba: <b>x adelante</b> en vertical, <b>y a la
          derecha</b> en horizontal, en milímetros. El perfil y el alzado funcionan igual con sus ejes, rotulados en cada
          vista. El origen es el punto de referencia del aparato, el mismo que usa el modelo de masas.
        </p>
        <p>
          Rueda para el zoom hacia el cursor; arrastra el fondo (o usa el botón central o derecho) para desplazarte. Las cotas
          de envergadura y longitud se actualizan solas. Las líneas discontinuas son reflejos.
        </p>
      </>
    ),
  },
  {
    id: "drawing",
    target: "plan-canvas",
    sides: ["right", "bottom"],
    title: "Dibujar",
    body: (
      <ul>
        <li>
          <b>Contorno</b>: un clic por vértice. Cierra con clic en el primero, doble clic o <Keys>Intro</Keys>.{" "}
          <Keys>Retroceso</Keys> quita el último y <Keys>Mayús</Keys> fija ángulos de 15°. Mientras dibujas ves la longitud y el
          ángulo del tramo.
        </li>
        <li>
          <b>Rectángulo</b>: arrastra de una esquina a la opuesta. <b>Círculo</b>: pulsa en el centro y arrastra hasta el
          radio.
        </li>
        <li>
          El cursor se engancha a vértices (cuadrado), al eje de simetría (rombo) y a la rejilla (cruz).
        </li>
      </ul>
    ),
  },
  {
    id: "editing",
    target: "plan-canvas",
    sides: ["right", "bottom"],
    title: "Editar lo dibujado",
    body: (
      <ul>
        <li>Arrastra una pieza para moverla; respeta el paso de la rejilla.</li>
        <li>Arrastra los cuadrados para mover vértices; los puntos «+» de cada lado añaden uno nuevo.</li>
        <li>Doble clic en un vértice lo quita. En cada lado ves su longitud en mm.</li>
        <li>
          Flechas: mover la pieza (<Keys>Mayús</Keys> ×10); <Keys>Av Pág</Keys> <Keys>Re Pág</Keys>: mover su plano medio.{" "}
          <Keys>Supr</Keys>: borrar. <Keys>Ctrl+D</Keys>: duplicar.
        </li>
      </ul>
    ),
    prepare: selectSomePlanElement,
  },
  {
    id: "plan-status",
    target: "plan-status",
    sides: ["top", "right"],
    title: "Barra de estado",
    body: (
      <p>
        Coordenadas del cursor en mm, qué ajuste se está aplicando y la ayuda de la herramienta activa. Útil para colocar un
        vértice en una medida exacta sin escribirla.
      </p>
    ),
  },
  {
    id: "properties",
    target: "properties",
    sides: ["left"],
    title: "Propiedades del elemento",
    body: (
      <>
        <p>
          Nombre, tipo, simetría y la vista donde está dibujado. La <b>posición del plano medio</b> es z en la planta
          (positiva hacia abajo, ejes FRD), y en el perfil y x en el alzado; el espesor se reparte por igual a cada lado. Las
          piezas de la misma vista, plano y espesor se funden en una sola plancha.
        </p>
        <p>
          Los vértices se pueden escribir a mano en mm; en un círculo, centro y diámetro (las hélices también en pulgadas).
          Debajo, su geometría calculada, y Duplicar o Eliminar.
        </p>
      </>
    ),
    prepare: selectSomePlanElement,
  },
  {
    id: "viewer",
    target: "viewer",
    sides: ["left", "bottom"],
    title: "El modelo 3D",
    body: (
      <>
        <p>
          Se construye a partir del dibujo: cada placa o ala se extruye con su espesor a su altura, las de una misma plancha se
          funden, los vaciados recortan y las hélices son discos translúcidos.
        </p>
        <p>
          Arrastra para girar, rueda para acercar y botón derecho para desplazar. Un clic en una pieza la selecciona también en
          el plano.
        </p>
      </>
    ),
    prepare: () => showPlanform("split"),
  },
  {
    id: "viewer-tools",
    target: "viewer-tools",
    sides: ["bottom", "left"],
    title: "Qué se ve en 3D",
    body: (
      <p>
        «Dibujo y piezas STL» muestra el modelo del dibujo y las piezas importadas. «Piezas de masa y CG» añade los bloques del modelo de masas, el símbolo
        del centro de gravedad y los ejes principales de inercia. «Encuadrar» centra la cámara en todo.
      </p>
    ),
  },
  {
    id: "results",
    target: "results",
    sides: ["top"],
    title: "Resultados",
    body: (
      <>
        <p>
          <b>Dibujo</b>: envergadura, longitud, altura, áreas en planta y frontal, volumen de piezas, superficie alar,
          alargamiento, derivas, hélices y capas, con los errores enlazados a su elemento. Además: <b>Masa y CG</b>, <b>Inercia</b>, <b>Aire</b> y{" "}
          <b>Avisos</b>.
        </p>
        <p>
          Cada resultado lleva su semáforo de validez (verde validado, ámbar fuera de lo validado, rojo fuera de rango), su
          procedencia (Medido, Calculado, Estimado) y, a un clic, el método con sus referencias y supuestos.
        </p>
      </>
    ),
  },
  {
    id: "exports",
    target: "exports",
    sides: ["top", "bottom", "left"],
    title: "Archivos para el taller",
    body: (
      <>
        <p>
          <b>STL</b>: todas las piezas en mm con Z hacia arriba, listo para el laminador. <b>SVG 1:1</b>: el contorno de cada
          plancha a escala real, con una regla de control de 50 mm para comprobar la escala al imprimir.
        </p>
        <p>El SVG aún no compensa el ancho de corte del láser (kerf); eso llega con el módulo de fabricación.</p>
      </>
    ),
  },
  {
    id: "parts",
    target: "parts-import",
    sides: ["right"],
    title: "Piezas STL",
    body: (
      <>
        <p>
          Importa un STL (binario o de texto, en mm, cm, pulgadas o m) y colócalo con posición, giro y escala. La app comprueba
          que la malla está cerrada y calcula su volumen, centroide e inercia exactos (tetraedros con signo, Mirtich).
        </p>
        <p>
          Cuenta en el modelo de masas cuando la pesas o indicas su densidad (nunca se supone una), y en el túnel con el Cd de
          su forma sobre su área frontal real, siempre como ESTIMADO ±40 %.
        </p>
      </>
    ),
    prepare: () => {
      const s = store();
      if (s.panel !== "parts") s.setPanel("parts");
    },
  },
  {
    id: "tunnel",
    target: "tunnel-settings",
    sides: ["right"],
    title: "Túnel de viento virtual",
    body: (
      <>
        <p>
          Barrido de ángulo de ataque del diseño tal como está dibujado y pesado. Sustentación y momentos por red de vórtices
          (VLM, Katz y Plotkin), resistencia inducida en el plano de Trefftz y parásita por componentes (Raymer), con fricción
          de placa plana y Cd de cuerpos romos.
        </p>
        <p>
          Te da CLα, CD₀, e de Oswald, L/D, el <b>punto neutro y el margen estático</b> con el CG real, la balanza de seis
          componentes, la carga en envergadura frente a la elíptica y el mapa de ΔCp. Hasta 5° verde, hasta 10° ámbar, más
          allá rojo: la pérdida no se modela.
        </p>
      </>
    ),
    prepare: () => showPlanform("tunnel"),
  },
  {
    id: "claude",
    target: null,
    title: "Diseñar hablando con Claude",
    body: (
      <>
        <p>
          Con el servidor MCP de AeroForja conectado a Claude Desktop puedes describir el dron o mandarle una foto o un boceto:
          Claude lo dibuja aquí en las tres vistas, lo ve renderizado, lo ensaya en el túnel y te propone cambios.
        </p>
        <p>
          Se instala con <code>pnpm mcp:install</code> y la app se conecta sola cuando está abierta en este equipo. Los pasos
          están en el README, sección «Diseñar con Claude».
        </p>
      </>
    ),
    prepare: () => showPlanform("three"),
  },
  {
    id: "mass-list",
    target: "mass-list",
    sides: ["right"],
    title: "El modelo de masas",
    body: (
      <p>
        Cada pieza con su masa en gramos, su forma y su procedencia. Abajo añades piezas nuevas por forma: caja, cilindro, tubo,
        esfera o masa puntual.
      </p>
    ),
    prepare: () => {
      const s = store();
      if (s.panel !== "mass") s.setPanel("mass");
    },
  },
  {
    id: "mass-properties",
    target: "properties",
    sides: ["left"],
    title: "Propiedades de una pieza",
    body: (
      <>
        <p>
          Masa con su incertidumbre (1σ) y su procedencia: «Medido» si la has pesado. Posición de su centro de masas en mm,
          con incertidumbre opcional, orientación (guiñada, cabeceo, alabeo) y forma con sus medidas para la inercia.
        </p>
        <p>Activa «Piezas de masa y CG» en el 3D para verlas junto a la planta.</p>
      </>
    ),
    prepare: () => {
      const s = store();
      if (s.panel !== "mass") s.setPanel("mass");
      const first = s.model.components[0];
      if (first !== undefined && !s.model.components.some((c) => c.id === s.selectedId)) s.select(first.id);
    },
  },
  {
    id: "project-files",
    target: "project-files",
    sides: ["right"],
    title: "Guardar y abrir",
    body: (
      <p>
        «Guardar JSON» descarga el proyecto completo: planta y modelo de masas. «Abrir JSON» lo carga en cualquier equipo,
        también los archivos antiguos que solo tenían masas.
      </p>
    ),
  },
  {
    id: "done",
    target: null,
    title: "Listo para dibujar",
    body: (
      <>
        <table className="tour-keys">
          <tbody>
            <tr>
              <td>
                <Keys>V</Keys> <Keys>P</Keys> <Keys>R</Keys> <Keys>C</Keys>
              </td>
              <td>Seleccionar, contorno, rectángulo, círculo</td>
            </tr>
            <tr>
              <td>
                <Keys>Ctrl+Z</Keys> <Keys>Ctrl+Y</Keys>
              </td>
              <td>Deshacer y rehacer</td>
            </tr>
            <tr>
              <td>
                <Keys>Ctrl+D</Keys> <Keys>Supr</Keys>
              </td>
              <td>Duplicar y borrar</td>
            </tr>
            <tr>
              <td>
                <Keys>←</Keys> <Keys>↑</Keys> <Keys>→</Keys> <Keys>↓</Keys>
              </td>
              <td>Mover la pieza (Mayús ×10)</td>
            </tr>
            <tr>
              <td>
                <Keys>F</Keys> <Keys>Esc</Keys>
              </td>
              <td>Encuadrar y cancelar</td>
            </tr>
          </tbody>
        </table>
        <p>La guía completa con capturas está en el README del repositorio.</p>
      </>
    ),
  },
];

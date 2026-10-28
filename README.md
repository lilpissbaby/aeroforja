# AeroForja

Diseñar, ensayar en un túnel virtual y volar en 3D drones antes de fabricarlos, con física publicada, rango de validez visible y comprobación contra ensayos reales.

**Estado: PoC en curso.**
- Entrega 1: unidades SI, envoltorio de resultados y atmósfera ISA validada.
- Entrega 2: humedad y condiciones medidas, y modelo de masas (CG, inercia e incertidumbre).
- Entrega 3: la app web con el visor 3D básico (modelo de masas editable, CG, ejes, aire), con la física en un Web Worker.
- Entrega 4: editor de planta en un plano cartesiano (mm, morro arriba) que genera el modelo 3D al momento, con exportación STL y SVG 1:1; despliegue con Docker en local y en el VPS.

## Requisitos

- Node ≥ 22.18 (ejecuta TypeScript directamente en `pnpm isa`) y pnpm 10.
- En Windows (PowerShell):

  ```powershell
  winget install OpenJS.NodeJS.LTS   # si no tienes Node; abre después una ventana nueva
  npm install -g pnpm@10
  # Si PowerShell dice que la ejecución de scripts está deshabilitada:
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

## Comandos

```bash
pnpm install
pnpm dev         # la app en http://localhost:5173 (se recarga sola al cambiar el código)
pnpm build       # versión de producción en packages/app/dist
pnpm preview     # sirve esa versión en http://localhost:4173
pnpm test        # tests unitarios + validación física (Vitest)
pnpm typecheck   # TypeScript estricto en todos los paquetes
pnpm check       # las dos cosas
pnpm isa 1500        # atmósfera a 1 500 m geométricos, con método, supuestos y semáforo
pnpm isa 1500 10 70  # lo mismo en un día ISA + 10 K con 70 % de humedad
pnpm air 1008 24 65  # aire medido: 1008 hPa de estación, 24 °C, 65 % de humedad
pnpm mass            # masa, CG e inercia del cuerpo sintético de ejemplo
pnpm mass mi-quad.json  # ...o de tu propio modelo (mismo formato que examples/mass-model.example.json)
pnpm docker:local    # la app en Docker en http://localhost:8080 (igual que en el VPS)
```

Despliegue en local y en el VPS: `docs/despliegue.md`.

## Estructura

```
packages/
  physics/      núcleo puro: unidades SI, vectores FRD/NED, cuaterniones, Result<T>,
                atmósfera (ISA, humedad, condiciones medidas) y modelo de masas
                (sin UI, sin APIs de navegador ni de Node)
  validation/   casos de referencia publicados, con fuente, cadena de transcripción y tolerancia
  app/          interfaz web (Vite + React + three.js); la física corre en un Web Worker
examples/       scripts de consola y el modelo de ejemplo
docs/design/    mini-diseños aprobados, uno por módulo físico, y notas de diseño
docs/decisiones.md  decisiones cerradas y abiertas
docs/despliegue.md  local y VPS
docker/         Dockerfile, nginx del contenedor, compose local y del VPS, conf para la infra
data/raw/       datos de terceros sin procesar (fuera de git)
```

Vendrán `data/` procesado (hélices UIUC, perfiles, motores, baterías), `solvers-wasm/` y `cfd-webgpu/` según la hoja de ruta.

## La app

- Centro: «Planta», «Planta + 3D» o «3D». Las dos vistas van sincronizadas: lo que dibujas o seleccionas en una aparece en la otra.
- Planta: plano cartesiano en mm visto desde arriba con el morro hacia arriba (x adelante, y derecha). Herramientas Contorno (P), Rectángulo (R) y Círculo (C); tipos placa, ala, vaciado y hélice; simetría automática respecto al eje x; ajuste a rejilla, a vértices y al eje; cotas de envergadura y longitud y de cada lado; deshacer y rehacer (Ctrl+Z, Ctrl+Y); rueda para el zoom y arrastre del fondo para desplazarse. Plantillas paramétricas de frame de multirrotor y de ala.
- Del plano al 3D: cada placa o ala se extruye con su espesor a su altura z; las que comparten altura y espesor se funden en una pieza y los vaciados las recortan. «Descargar STL» (mm, Z arriba) y «Descargar SVG 1:1» (con regla de control de 50 mm). Detalles en `docs/design/003-planta-2d-a-3d.md`.
- Visor 3D: piezas, ejes cuerpo FRD desde el origen, CG con su símbolo y ejes principales de inercia. Clic en una pieza para editarla.
- Panel derecho: masa con su incertidumbre y procedencia, posición en mm, orientación en grados (secuencia z-y-x) y forma.
- Panel inferior: masa y CG, inercia, aire y avisos. Cada resultado lleva su semáforo, su procedencia y, a un clic, el método, las referencias y los supuestos.
- El trabajo se guarda en el navegador entre sesiones. Para copias o para pasarlo a otro equipo, usa «Guardar JSON» y «Abrir JSON» (proyecto v2: modelo de masas + planta; los JSON v1 se siguen abriendo).

## Reglas del núcleo

- Todo en SI. La conversión a mm, g, rpm o °C vive solo en la UI.
- Cada magnitud lleva su unidad en el tipo (`Meters`, `Kelvin`, `Pascals`…): el compilador impide mezclar una presión con una temperatura.
- Ningún resultado sale sin su envoltorio `Result<T>`: valor, procedencia (MEASURED, CALCULATED o ESTIMATED), métodos con referencia, supuestos y semáforo de validez (verde validado, ámbar aplicable sin validar, rojo fuera de rango).
- `physics` compila sin las librerías del navegador ni de Node: usar `document`, `fetch` o `process` es un error de compilación.
- Misma entrada, mismo resultado.
- Ningún módulo físico está terminado sin tests de validación contra casos publicados con tolerancia explícita.

## Licencia

Sin licencia por ahora (todos los derechos reservados). Se decide antes de publicar nada; afecta a la integración de un solver derivado de XFOIL (GPL).

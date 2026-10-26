# AeroForja

Diseñar, ensayar en un túnel virtual y volar en 3D drones antes de fabricarlos, con física publicada, rango de validez visible y comprobación contra ensayos reales.

**Estado: PoC en curso.** Entrega 1: núcleo físico con unidades SI, envoltorio de resultados y atmósfera ISA validada.

## Requisitos

- Node ≥ 22 y pnpm 10 (`corepack enable` si no lo tienes).

## Comandos

```bash
pnpm install
pnpm test        # tests unitarios + validación física (Vitest)
pnpm typecheck   # TypeScript estricto en todos los paquetes
pnpm check       # las dos cosas
pnpm isa 1500    # atmósfera a 1 500 m geométricos, con método, supuestos y semáforo
pnpm isa 1500 10 # lo mismo en un día ISA + 10 K
```

## Estructura

```
packages/
  physics/      núcleo puro: unidades SI, Result<T>, atmósfera ISA (sin UI, sin APIs de navegador ni de Node)
  validation/   casos de referencia publicados, con fuente, cadena de transcripción y tolerancia
examples/       scripts de consola para ver resultados
docs/design/    mini-diseños aprobados, uno por módulo físico
```

Vendrán `data/` (hélices UIUC, perfiles, motores, baterías), `solvers-wasm/`, `cfd-webgpu/`, `app/` y `docker/` según la hoja de ruta.

## Reglas del núcleo

- Todo en SI. La conversión a mm, g, rpm o °C vive solo en la UI.
- Cada magnitud lleva su unidad en el tipo (`Meters`, `Kelvin`, `Pascals`…): el compilador impide mezclar una presión con una temperatura.
- Ningún resultado sale sin su envoltorio `Result<T>`: valor, procedencia (MEASURED, CALCULATED o ESTIMATED), métodos con referencia, supuestos y semáforo de validez (verde validado, ámbar aplicable sin validar, rojo fuera de rango).
- `physics` compila sin las librerías del navegador ni de Node: usar `document`, `fetch` o `process` es un error de compilación.
- Misma entrada, mismo resultado.
- Ningún módulo físico está terminado sin tests de validación contra casos publicados con tolerancia explícita.

## Licencia

Sin licencia por ahora (todos los derechos reservados). Se decide antes de publicar nada; afecta a la integración de un solver derivado de XFOIL (GPL).

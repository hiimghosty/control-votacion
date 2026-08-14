# Conteo de votos — Decano / Vice decano

**Autor:** Mauricio Benitez

App de conteo en un archivo HTML, con bitácora append-only, backup en CSV,
control de cuadre entre elecciones y verificación de coherencia. Pensada para
usarse en una mesa el día de la elección: se abre en el navegador, no necesita
servidor ni instalación, y va guardando cada voto como un evento append-only
(no se puede "editar" un total sin dejar rastro).

## Archivos

| Archivo | Qué es |
|---|---|
| `conteo-votos.html` | La aplicación. Se abre en el navegador (Chrome o Edge para el backup en tiempo real). |
| `conteo.js` | **Lógica pura** (modelo, CSV, importación, coherencia, cuadre). Sin DOM. La usan tanto el HTML como las pruebas. |
| `conteo.test.js` | Pruebas de la lógica, en Node. |
| `conteo-votos-standalone.html` | **Versión de un solo archivo** (HTML-only), para compartir o mover sin depender de `conteo.js`. Ver más abajo. |
| `README.md` | Este archivo. |

> **Importante:** `conteo-votos.html` y `conteo.js` deben estar **en la misma carpeta**.
> El HTML carga `conteo.js`; si falta, muestra un aviso y no arranca. Al mover o
> compartir la app, lleva siempre los dos archivos juntos. Si necesitás un solo
> archivo, usá `conteo-votos-standalone.html` en su lugar.

## Versión de un solo archivo (`conteo-votos-standalone.html`)

Es la misma app, pero con el contenido de `conteo.js` **embebido** dentro de un
`<script>` inline en vez de cargarlo con `<script src="conteo.js">`. Sirve para
repartir un único archivo `.html` (por mail, USB, etc.) sin riesgo de que se
separe de su `conteo.js` y deje de arrancar.

- Es un **archivo generado**, no se edita a mano: es una copia textual de
  `conteo.js` pegada dentro de `conteo-votos.html`. Si cambia la lógica en
  `conteo.js` (o el HTML de la interfaz), hay que **regenerar** este archivo,
  no tocar su lógica directamente.
- `conteo.js` (y sus pruebas en `conteo.test.js`) siguen siendo la única
  fuente de verdad de la lógica; este archivo es solo un empaquetado para
  distribución.

## Por qué está separado en dos archivos

Antes toda la lógica vivía dentro del HTML y no se podía probar sin un navegador.
Ahora la lógica que no depende de la pantalla vive en `conteo.js`, así que:

- Se puede **probar con Node**, sin abrir el navegador.
- La app y las pruebas usan **exactamente el mismo código** (una sola fuente de
  verdad): si un test pasa, es el mismo código que corre la app.

Lo que quedó en el HTML es solo la interfaz: dibujar tarjetas, el gráfico de torta,
leer clics, guardar en el navegador y escribir el backup. Eso se prueba a ojo.

## Correr las pruebas

Necesitas [Node.js](https://nodejs.org) 18 o superior (probado con v22).
No hay dependencias que instalar: se usa el runner integrado de Node.

```bash
cd <carpeta-del-proyecto>
node --test
```

Salida esperada: `# pass 21  # fail 0`.

Para ver el detalle de cada prueba:

```bash
node --test --test-reporter=spec
```

## Qué cubren las pruebas (solo lógica)

- **Modelo:** 8 categorías (2 candidatos + blanco + nulo por elección), 4 editables.
- **Totales y cuadre:** subtotales por elección y comparación Decano vs Vice.
- **Bitácora:** reproducir los deltas (`replay`) reconstruye los votos; conteo de sumas y correcciones.
- **CSV ida y vuelta:** `toCSV` → `importFromCSV` restaura votos, nombres, alcance,
  mesa y estado; incluso con nombres que llevan comas o comillas.
- **Desambiguación:** el blanco/nulo de Decano no se confunde con el de Vice decano.
- **Alcance:** importar respeta "solo Decano" / "solo Vice decano".
- **Robustez de importación:** columnas de categoría en otro orden, o con la
  columna `campo` ausente (se deduce comparando los snapshots de votos de filas
  consecutivas).
- **Coherencia (anti-manipulación):** detecta totales editados a mano, filas
  borradas (saltos de secuencia) y un conteo que no cuadra con la bitácora;
  distingue una fila borrada de una simplemente reordenada.
- **Parser CSV:** comillas escapadas y saltos de línea.

## Estado de las pruebas

Última corrida: `node --test` → **21 pass, 0 fail**.

En la revisión de esta versión se encontraron y corrigieron dos casos borde en
`conteo.js` (cada uno con su prueba en `conteo.test.js` que primero falló y
luego pasó tras el arreglo):

- **Falso positivo de manipulación al importar un CSV sin columna `campo`.**
  Los votos se recuperaban bien (el snapshot completo de cada fila alcanza),
  pero `checkCoherence` marcaba el acta como alterada porque no podía asociar
  cada delta a una categoría. Ahora, si el texto de `campo` no se puede
  resolver, se deduce comparando el snapshot de votos con el de la fila
  anterior.
- **Mensaje "posible fila borrada" en filas solo reordenadas.** Si dos eventos
  de la bitácora quedaban intercambiados de lugar (sin que ninguno
  desapareciera), `checkCoherence` seguía detectando el problema pero decía
  que faltaba una fila que en realidad seguía ahí. Ahora distingue "borrada"
  de "desordenada" según si el número de secuencia esperado existe en algún
  otro punto de la bitácora.

También se agregó cobertura para CSV con las columnas de categoría en un
orden distinto al habitual (ya funcionaba, pero no estaba probado).

## Límite conocido (a propósito)

La verificación de coherencia detecta **ediciones y borrados** de un registro
existente. **No** detecta un acta fabricada desde cero que sea internamente
consistente (deltas y totales que concuerdan entre sí). Para eso haría falta una
firma criptográfica, que se decidió no incluir. La defensa real sigue siendo de
procedimiento: copias del acta en manos de varias personas, firma en papel y
conteo a la vista.

## Seguir con Claude Code

[Claude Code](https://www.anthropic.com/claude-code) es un agente que trabaja
sobre esta carpeta desde la terminal: lee los archivos, propone cambios, corre
las pruebas y arregla lo que falle, en ciclo.

Flujo sugerido una vez instalado (revisa la documentación oficial para la
instalación y requisitos, que cambian seguido):

1. Abre una terminal en la carpeta del proyecto.
2. Inicia Claude Code ahí.
3. Pídele tareas concretas apoyándote en las pruebas como red de seguridad. Ejemplos:

   - «Corre `node --test` y arregla cualquier fallo que aparezca.»
   - «Agrega pruebas para el caso en que se importa un CSV con el alcance en "solo
     Vice decano" y luego se cierra la mesa; después haz que pasen.»
   - «Quiero una tercera elección (Consejero). Actualiza `conteo.js`, el HTML y
     agrega pruebas. No rompas las pruebas existentes.»
   - «Refactoriza `checkCoherence` para que devuelva también en qué evento
     empieza el problema, con una prueba que lo verifique.»

Reglas útiles para pedirle:

- **La lógica va en `conteo.js`**, no dentro del HTML. Así se mantiene testeable.
- **Toda función nueva de lógica lleva su prueba** en `conteo.test.js`.
- **`node --test` debe quedar en verde** antes de dar por terminado un cambio.
- El HTML es solo interfaz; los cambios de lógica no deberían necesitar tocar el
  render salvo para mostrar algo nuevo.

## Formato del acta CSV (referencia)

Columnas: `seq, fecha_hora, iso_utc, evento, campo, delta,` una columna por cada
categoría (`dec_a, dec_b, dec_blanco, dec_nulo, vic_c, vic_d, vic_blanco,
vic_nulo`)`, t_decano, t_vice, mesa, operador, nota`.

- Cada fila es un evento de la bitácora (append-only): `apertura`, `+1`, `-1`
  (corrección) y `cierre`.
- El evento `apertura` guarda en `nota` un JSON con el alcance y los nombres de
  los candidatos, para poder reconstruir todo al importar.
- Al final del archivo hay filas `resumen` con el cuadre y los totales finales;
  la importación las ignora.

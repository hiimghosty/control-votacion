/*
 * conteo.test.js — Pruebas de la lógica pura (sin navegador).
 * Ejecutar:  node --test
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./conteo.js");

/* ---------- helpers de prueba ---------- */
// Crea un estado vacío como el de la app.
function mkState(scope = "ambos") {
  return {
    mesa: "Mesa 1", operador: "Op", scope, names: C.DEFAULT_NAMES(),
    opened: false, closed: false, openedISO: "", closedISO: "",
    seq: 0, votes: C.ZERO(), events: [],
  };
}
// Aplica un evento igual que logEvent en la app (muta votes, agrega a la bitácora).
function apply(st, evento, campo, delta, nota) {
  if (delta) st.votes[campo] += delta;
  st.seq++;
  st.events.push({
    seq: st.seq, iso: new Date().toISOString(), local: "hora",
    evento, campo: campo || "", delta: delta || 0,
    v: { ...st.votes }, tDec: C.tDec(st.votes), tVic: C.tVic(st.votes), nota: nota || "",
  });
}
// Abre la mesa registrando alcance + nombres, como la app.
function abrir(st) {
  st.opened = true; st.openedISO = new Date().toISOString();
  const j = { scope: st.scope };
  C.editableCats.forEach(c => j[c.key] = st.names[c.key]);
  apply(st, "apertura", "", 0, JSON.stringify(j));
}
function cerrar(st) { st.closed = true; st.closedISO = new Date().toISOString(); apply(st, "cierre", "", 0, "cierre"); }

/* ---------- modelo ---------- */
test("modelo: 8 categorías, 4 editables, keys únicas", () => {
  assert.equal(C.CATKEYS.length, 8);
  assert.equal(C.editableCats.length, 4);
  assert.equal(new Set(C.CATKEYS).size, 8);
});

test("ZERO y DEFAULT_NAMES tienen la forma correcta", () => {
  assert.deepEqual(Object.keys(C.ZERO()).sort(), [...C.CATKEYS].sort());
  const n = C.DEFAULT_NAMES();
  assert.equal(Object.keys(n).length, 4);
  assert.equal(n.dec_a, "Candidato A");
});

test("scopeLabel e isRaceActive", () => {
  assert.equal(C.scopeLabel("ambos"), "Ambas elecciones");
  assert.equal(C.scopeLabel("decano"), "Solo Decano");
  assert.equal(C.scopeLabel("vice"), "Solo Vice decano");
  assert.equal(C.isRaceActive("ambos", "decano"), true);
  assert.equal(C.isRaceActive("decano", "vice"), false);
  assert.equal(C.activeRaces("vice").length, 1);
  assert.equal(C.activeRaces("ambos").length, 2);
});

/* ---------- totales y replay ---------- */
test("subtotales y cuadre", () => {
  const v = C.ZERO();
  v.dec_a = 3; v.dec_b = 2; v.dec_blanco = 1;         // decano = 6
  v.vic_c = 4; v.vic_d = 1; v.vic_nulo = 1;           // vice   = 6
  assert.equal(C.tDec(v), 6);
  assert.equal(C.tVic(v), 6);
  assert.equal(C.tDec(v), C.tVic(v)); // cuadra
});

test("replay reconstruye los votos desde los deltas", () => {
  const st = mkState(); abrir(st);
  apply(st, "+1", "dec_a", +1);
  apply(st, "+1", "dec_a", +1);
  apply(st, "+1", "dec_b", +1);
  apply(st, "-1", "dec_a", -1); // corrección
  const v = C.replay(st.events);
  assert.equal(v.dec_a, 1);
  assert.equal(v.dec_b, 1);
  assert.deepEqual(v, st.votes);
});

test("countEv cuenta sumas y correcciones", () => {
  const st = mkState(); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "dec_b", +1); apply(st, "-1", "dec_b", -1);
  assert.equal(C.countEv(st.events, "+1"), 2);
  assert.equal(C.countEv(st.events, "-1"), 1);
});

/* ---------- campos / desambiguación blanco-nulo ---------- */
test("csvCampo distingue blanco/nulo de cada elección", () => {
  const n = C.DEFAULT_NAMES();
  assert.equal(C.csvCampo("dec_blanco", n), "Decano — Voto en blanco");
  assert.equal(C.csvCampo("vic_blanco", n), "Vice decano — Voto en blanco");
  assert.notEqual(C.csvCampo("dec_blanco", n), C.csvCampo("vic_blanco", n));
});

test("keyFromCampo recupera la key con nombres personalizados", () => {
  const n = { ...C.DEFAULT_NAMES(), dec_a: "Ana Pérez", vic_c: "Ana Pérez" };
  // mismo nombre en las dos elecciones: el prefijo de elección los distingue
  assert.equal(C.keyFromCampo("Decano — Ana Pérez", n), "dec_a");
  assert.equal(C.keyFromCampo("Vice decano — Ana Pérez", n), "vic_c");
  assert.equal(C.keyFromCampo("Decano — Voto nulo", n), "dec_nulo");
});

/* ---------- CSV: ida y vuelta ---------- */
test("toCSV -> importFromCSV restaura estado (ambas elecciones)", () => {
  const st = mkState("ambos");
  st.names.dec_a = "Ana"; st.names.dec_b = "Beto"; st.names.vic_c = "Cora"; st.names.vic_d = "Dino";
  abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "vic_c", +1);
  apply(st, "+1", "dec_b", +1); apply(st, "+1", "vic_d", +1);
  apply(st, "+1", "dec_blanco", +1); apply(st, "+1", "vic_nulo", +1);
  cerrar(st);

  const csv = C.toCSV(st);
  const back = C.importFromCSV(csv);
  assert.ok(back);
  assert.deepEqual(back.votes, st.votes);
  assert.equal(back.scope, "ambos");
  assert.equal(back.mesa, "Mesa 1");
  assert.equal(back.opened, true);
  assert.equal(back.closed, true);
  assert.deepEqual(back.names, st.names);
  assert.deepEqual(C.checkCoherence(back), []); // sigue coherente
});

test("import respeta el alcance (solo decano)", () => {
  const st = mkState("decano"); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "dec_b", +1);
  const back = C.importFromCSV(C.toCSV(st));
  assert.equal(back.scope, "decano");
  assert.equal(C.tVic(back.votes), 0);
  assert.equal(C.tDec(back.votes), 2);
});

test("las filas de resumen no se importan como eventos", () => {
  const st = mkState(); abrir(st); apply(st, "+1", "dec_a", +1); cerrar(st);
  const back = C.importFromCSV(C.toCSV(st));
  assert.equal(back.events.length, st.events.length); // apertura + +1 + cierre; sin filas 'resumen'
  assert.ok(back.events.every(e => e.evento !== "resumen"));
});

test("CSV con nombres que llevan comas/comillas sobrevive el viaje", () => {
  const st = mkState(); st.names.dec_a = 'Núñez, "Pepe"'; abrir(st);
  apply(st, "+1", "dec_a", +1);
  const back = C.importFromCSV(C.toCSV(st));
  assert.equal(back.names.dec_a, 'Núñez, "Pepe"');
  assert.equal(back.votes.dec_a, 1);
});

/* ---------- coherencia / detección de manipulación ---------- */
test("estado normal es coherente", () => {
  const st = mkState(); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "vic_c", +1); apply(st, "-1", "dec_a", -1);
  assert.deepEqual(C.checkCoherence(st), []);
});

test("detecta totales editados a mano en un evento", () => {
  const st = mkState(); abrir(st); apply(st, "+1", "dec_a", +1); apply(st, "+1", "dec_a", +1);
  st.events[1].v.dec_a = 99; // manipulación: el total del evento ya no cuadra con su historial
  const iss = C.checkCoherence(st);
  assert.ok(iss.some(m => /no cuadran con su historial/.test(m)));
});

test("detecta fila borrada (salto de secuencia)", () => {
  const st = mkState(); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "dec_b", +1); apply(st, "+1", "vic_c", +1);
  st.events.splice(2, 1); // borra un evento del medio -> queda un hueco en la numeración
  const iss = C.checkCoherence(st);
  assert.ok(iss.some(m => /Falta el evento/.test(m)));
});

test("detecta que el conteo mostrado no cuadra con la bitácora", () => {
  const st = mkState(); abrir(st); apply(st, "+1", "dec_a", +1);
  st.votes.dec_a = 50; // alguien tocó el conteo sin dejar rastro en los eventos
  const iss = C.checkCoherence(st);
  assert.ok(iss.some(m => /no coincide con la suma de los eventos/.test(m)));
});

test("CSV con columnas de categoría en otro orden se importa igual", () => {
  const st = mkState("ambos"); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "vic_c", +1);
  const csv = C.toCSV(st);

  // Reordena las columnas del header (y cada fila) sin quitar ninguna.
  const lines = csv.split("\r\n").filter(l => l !== "");
  const rows = lines.map(l => C.parseCSV(l + "\n")[0]);
  const order = rows[0].map((_, i) => i).sort(() => 0.5 - Math.random());
  const reordered = rows.map(r => order.map(i => r[i]));
  const csvReordered = reordered.map(r => r.map(f => '"' + String(f).replace(/"/g, '""') + '"').join(",")).join("\r\n") + "\r\n";

  const back = C.importFromCSV(csvReordered);
  assert.ok(back);
  assert.deepEqual(back.votes, st.votes);
  assert.deepEqual(C.checkCoherence(back), []);
});

test("importFromCSV: si falta la columna 'campo', el campo se deduce del snapshot de votos", () => {
  const st = mkState("ambos"); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "vic_c", +1);
  const csv = C.toCSV(st);

  // Simula un archivo al que le falta la columna 'campo' (p. ej. exportado por otra herramienta).
  const lines = csv.split("\r\n").filter(l => l !== "");
  const rows = lines.map(l => C.parseCSV(l + "\n")[0]);
  const campoIdx = rows[0].indexOf("campo");
  const stripped = rows.map(r => r.filter((_, i) => i !== campoIdx));
  const csvSinCampo = stripped.map(r => r.map(f => '"' + String(f).replace(/"/g, '""') + '"').join(",")).join("\r\n") + "\r\n";

  const back = C.importFromCSV(csvSinCampo);
  assert.ok(back);
  assert.deepEqual(back.votes, st.votes); // los votos se recuperan igual (snapshots completos por fila)
  assert.deepEqual(C.checkCoherence(back), []); // sin columna 'campo' no debería marcarse como manipulado
});

test("checkCoherence distingue una fila reordenada de una fila realmente borrada", () => {
  const st = mkState(); abrir(st);
  apply(st, "+1", "dec_a", +1); apply(st, "+1", "dec_b", +1); apply(st, "+1", "vic_c", +1);
  [st.events[1], st.events[2]] = [st.events[2], st.events[1]]; // reordena sin borrar nada
  const iss = C.checkCoherence(st);
  assert.ok(iss.length > 0); // sigue detectando que algo anda mal...
  assert.ok(!iss.some(m => /borrada/.test(m))); // ...pero no debe decir "fila borrada": no se borró nada
});

/* ---------- parseCSV robusto ---------- */
test("parseCSV maneja comillas escapadas y saltos de línea", () => {
  const txt = 'a,b,c\r\n1,"x, y","dijo ""hola"""\r\n';
  const rows = C.parseCSV(txt);
  assert.deepEqual(rows[0], ["a", "b", "c"]);
  assert.deepEqual(rows[1], ["1", "x, y", 'dijo "hola"']);
});

test("importFromCSV devuelve null ante archivo inválido", () => {
  assert.equal(C.importFromCSV(""), null);
  assert.equal(C.importFromCSV("solo,una,fila\n"), null); // sin columnas evento/delta
});

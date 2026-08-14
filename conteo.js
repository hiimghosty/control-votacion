/*
 * conteo.js — Lógica pura del conteo de votos (Decano / Vice decano).
 *
 * No toca el DOM, ni localStorage, ni el navegador: solo funciones que reciben
 * datos y devuelven datos. Por eso se puede probar con Node directamente.
 *
 * Se usa en dos entornos:
 *   - Navegador:  <script src="conteo.js"></script>  ->  window.Conteo
 *   - Node/tests: const C = require("./conteo.js");
 *
 * El estado ("state") es un objeto plano con esta forma:
 *   { mesa, operador, scope, names, opened, closed, openedISO, closedISO,
 *     seq, votes, events }
 * y cada evento de la bitácora:
 *   { seq, iso, local, evento, campo, delta, v, tDec, tVic, nota }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Conteo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ===== modelo: dos elecciones ===== */
  const RACES = [
    { key: "decano", label: "Decano", cats: [
      { key: "dec_a", def: "Candidato A", color: "#3B82F6", editable: true },
      { key: "dec_b", def: "Candidato B", color: "#8B5CF6", editable: true },
      { key: "dec_blanco", def: "Voto en blanco", color: "#E5E7EB", editable: false },
      { key: "dec_nulo", def: "Voto nulo", color: "#9CA3AF", editable: false },
    ]},
    { key: "vice", label: "Vice decano", cats: [
      { key: "vic_c", def: "Candidato C", color: "#F59E0B", editable: true },
      { key: "vic_d", def: "Candidato D", color: "#EF4444", editable: true },
      { key: "vic_blanco", def: "Voto en blanco", color: "#E5E7EB", editable: false },
      { key: "vic_nulo", def: "Voto nulo", color: "#9CA3AF", editable: false },
    ]},
  ];
  const ALL = RACES.flatMap(r => r.cats.map(c => ({ ...c, race: r.key })));
  const CATKEYS = ALL.map(c => c.key);
  const catOf = k => ALL.find(c => c.key === k) || { def: "", editable: false, race: "" };
  const raceOf = k => RACES.find(r => r.key === catOf(k).race) || { label: "" };
  const editableCats = ALL.filter(c => c.editable);
  const DEFAULT_NAMES = () => { const o = {}; editableCats.forEach(c => o[c.key] = c.def); return o; };
  const ZERO = () => { const o = {}; CATKEYS.forEach(k => o[k] = 0); return o; };
  const scopeLabel = s => s === "decano" ? "Solo Decano" : s === "vice" ? "Solo Vice decano" : "Ambas elecciones";
  const isRaceActive = (scope, rk) => scope === "ambos" || scope === rk;
  const activeRaces = scope => RACES.filter(r => isRaceActive(scope, r.key));

  /* ===== nombres y campos ===== */
  const nameOf = (k, names) => { const c = catOf(k); return (c.editable && names && names[k]) ? names[k] : c.def; };
  const csvCampo = (k, names) => k ? (raceOf(k).label + " — " + nameOf(k, names)) : "";
  function keyFromCampo(campoStr, names) {
    const t = String(campoStr).trim().toLowerCase();
    for (const c of ALL) { if (csvCampo(c.key, names).trim().toLowerCase() === t) return c.key; }
    return "";
  }

  /* ===== totales ===== */
  const subtotal = (votes, raceKey) => RACES.find(r => r.key === raceKey).cats.reduce((s, c) => s + (votes[c.key] || 0), 0);
  const tDec = votes => subtotal(votes, "decano");
  const tVic = votes => subtotal(votes, "vice");
  const countEv = (events, t) => events.filter(e => e.evento === t).length;

  // Reproduce la bitácora aplicando los deltas en orden -> votos resultantes.
  function replay(events) {
    const v = ZERO();
    for (const e of events) { if (e.delta && v[e.campo] != null) v[e.campo] += e.delta; }
    return v;
  }

  /* ===== CSV ===== */
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const HEADER = ["seq", "fecha_hora", "iso_utc", "evento", "campo", "delta", ...CATKEYS, "t_decano", "t_vice", "mesa", "operador", "nota"];

  function csvRow(state, o) {
    const cells = [
      o.seq ?? "", q(o.local ?? ""), q(o.iso ?? ""), q(o.evento ?? ""), q(o.campo ?? ""), (o.delta ?? ""),
      ...CATKEYS.map(k => (o.v && o.v[k] != null) ? o.v[k] : ""),
      (o.tDec ?? ""), (o.tVic ?? ""), q(state.mesa), q(state.operador), q(o.nota ?? ""),
    ];
    return cells.join(",");
  }

  function toCSV(state) {
    const lines = [HEADER.join(",")];
    state.events.forEach(e => {
      lines.push(csvRow(state, {
        seq: e.seq, local: e.local, iso: e.iso, evento: e.evento,
        campo: csvCampo(e.campo, state.names), delta: e.delta, v: e.v, tDec: e.tDec, tVic: e.tVic, nota: e.nota,
      }));
    });
    const rs = (campo, nota, v, td, tv) => lines.push(csvRow(state, { evento: "resumen", campo, nota, v, tDec: td, tVic: tv }));
    const d = tDec(state.votes), vc = tVic(state.votes);
    rs("Alcance", scopeLabel(state.scope));
    rs("Total de eventos", String(state.events.length));
    rs("Sumas (+1)", String(countEv(state.events, "+1")));
    rs("Correcciones (-1)", String(countEv(state.events, "-1")));
    rs("Estado", state.closed ? "Cerrada" : (state.opened ? "Abierta" : "Sin abrir"));
    if (state.scope === "ambos") rs("Cuadre Decano vs Vice", d === vc ? "CUADRA" : ("DIFERENCIA " + Math.abs(d - vc)));
    rs("Totales finales", "Decano " + d + " / Vice " + vc, { ...state.votes }, d, vc);
    return lines.join("\r\n") + "\r\n";
  }

  function parseCSV(text) {
    const rows = []; let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (ch === "\r") { /* skip */ }
        else field += ch;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
  }

  function importFromCSV(text) {
    const rows = parseCSV(text); if (rows.length < 2) return null;
    const head = rows[0].map(h => h.trim().toLowerCase()); const idx = n => head.indexOf(n);
    const iSeq = idx("seq"), iLocal = idx("fecha_hora"), iIso = idx("iso_utc"), iEv = idx("evento"),
          iCampo = idx("campo"), iDelta = idx("delta"), iMesa = idx("mesa"), iOp = idx("operador"), iNota = idx("nota");
    const catIdx = {}; CATKEYS.forEach(k => catIdx[k] = idx(k));
    if (iEv < 0 || iDelta < 0) return null;

    let names = DEFAULT_NAMES(), scope = "ambos";
    for (let r = 1; r < rows.length; r++) {
      if ((rows[r][iEv] || "").trim() === "apertura" && iNota >= 0) {
        try { const o = JSON.parse(rows[r][iNota]); editableCats.forEach(c => { if (o[c.key]) names[c.key] = o[c.key]; }); if (o.scope) scope = o.scope; } catch (e) {}
        break;
      }
    }

    const evs = [];
    for (let r = 1; r < rows.length; r++) {
      const c = rows[r]; if (c.length < 2) continue;
      const evento = (c[iEv] || "").trim(); if (evento === "resumen" || evento === "") continue;
      const delta = parseInt(c[iDelta] || "0", 10) || 0;
      const campoKey = iCampo >= 0 ? keyFromCampo(c[iCampo], names) : "";
      const rec = {
        seq: iSeq >= 0 ? parseInt(c[iSeq], 10) : r, iso: iIso >= 0 ? c[iIso] : "", local: iLocal >= 0 ? c[iLocal] : "",
        evento, campo: campoKey, delta, nota: iNota >= 0 ? c[iNota] : "",
      };
      let hasV = true; const vv = {};
      for (const k of CATKEYS) { const ix = catIdx[k]; if (ix >= 0 && c[ix] !== "" && c[ix] != null) { vv[k] = parseInt(c[ix], 10) || 0; } else { hasV = false; } }
      if (hasV) rec.v = vv;
      evs.push(rec);
    }
    evs.sort((a, b) => a.seq - b.seq);

    // Si el texto de 'campo' no se pudo resolver (columna ausente o nombre que no
    // calza) pero la fila trae el snapshot completo de votos, deducimos qué
    // categoría cambió comparándolo con el snapshot anterior.
    let prevSnap = ZERO();
    for (const e of evs) {
      if (e.v && !e.campo && e.delta) {
        const changed = CATKEYS.filter(k => e.v[k] !== prevSnap[k]);
        if (changed.length === 1) { e.campo = changed[0]; e.delta = e.v[changed[0]] - prevSnap[changed[0]]; }
      }
      if (e.v) prevSnap = e.v;
    }

    let votes; const last = evs[evs.length - 1];
    if (last && last.v) { votes = { ...last.v }; }
    else { const v = ZERO(); evs.forEach(e => { if (e.delta && v[e.campo] != null) v[e.campo] += e.delta; e.v = { ...v }; }); votes = v; }
    evs.forEach(e => { if (e.v) { e.tDec = subtotal(e.v, "decano"); e.tVic = subtotal(e.v, "vice"); } });

    const apertura = evs.find(e => e.evento === "apertura"), cierre = evs.find(e => e.evento === "cierre");
    const first = rows[1];
    return {
      mesa: iMesa >= 0 ? (first[iMesa] || "") : "", operador: iOp >= 0 ? (first[iOp] || "") : "", scope, names,
      opened: !!apertura || evs.length > 0, closed: !!cierre,
      openedISO: apertura ? apertura.iso : "", closedISO: cierre ? cierre.iso : "",
      seq: evs.length ? evs[evs.length - 1].seq : 0, votes, events: evs,
    };
  }

  /* ===== verificación de coherencia (anti-manipulación) ===== */
  function checkCoherence(state) {
    const issues = []; const evs = state.events; if (evs.length === 0) return issues;
    const seqSet = new Set(evs.map(e => e.seq));
    const v = ZERO(); let prev = null;
    for (const e of evs) {
      if (prev !== null && e.seq !== prev + 1) {
        // Si el #prev+1 existe en algún otro lugar de la bitácora, no falta: está
        // fuera de orden. Solo se reporta "borrada" cuando esa fila no aparece en
        // ninguna parte.
        issues.push(seqSet.has(prev + 1)
          ? `Secuencia desordenada cerca del #${e.seq}.`
          : `Falta el evento #${prev + 1} en la secuencia (posible fila borrada).`);
      }
      prev = e.seq;
      if (e.delta && v[e.campo] != null) v[e.campo] += e.delta;
      if (e.v) {
        let bad = false;
        for (const k of CATKEYS) { if (e.v[k] !== v[k]) { bad = true; break; } }
        if (bad) { issues.push(`El evento #${e.seq} tiene totales que no cuadran con su historial (posible edición).`); break; }
      }
    }
    for (const k of CATKEYS) { if (v[k] !== state.votes[k]) { issues.push("El conteo mostrado no coincide con la suma de los eventos de la bitácora."); break; } }
    return issues.slice(0, 3);
  }

  return {
    RACES, ALL, CATKEYS, catOf, raceOf, editableCats, DEFAULT_NAMES, ZERO, scopeLabel,
    isRaceActive, activeRaces, nameOf, csvCampo, keyFromCampo,
    subtotal, tDec, tVic, countEv, replay,
    HEADER, toCSV, parseCSV, importFromCSV, checkCoherence,
  };
});

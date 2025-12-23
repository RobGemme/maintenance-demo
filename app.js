// app.js — Maintenance demo (no build, runs in browser)
// Requires: PapaParse (loaded in index.html)

const VEHICLES_CSV = "vehicules.csv";
const MAINT_TYPES_CSV = "maintenance_types.csv";

const state = {
  vehicles: [],
  maintTypes: [],
  filters: {
    make: new Set(),
    model: new Set(),
    engine: new Set(),
    trans: new Set(),
    propul: new Set(),
    fuel: new Set(),
    yearFrom: null,
    yearTo: null,
  },
  ui: {
    selectedMaintCode: "",
    cost: "",
    retail: "",
    firstMonths: "",
    firstKm: "",
    repeatMonths: "",
    repeatKm: "",
  },
  savedRules: [],
};

const ASSIGNMENT_HEADER = [
  "rule_id","maint_code","cost","retail",
  "make","model","year_from","year_to","engine","trans","propul","fuel",
  "first_months","first_km","repeat_months","repeat_km","trigger_logic"
];

function $(id) { return document.getElementById(id); }

function parseCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

function uniqSorted(arr) {
  const s = new Set(arr.filter(v => v !== undefined && v !== null && String(v).trim() !== ""));
  return Array.from(s).sort((a,b) => String(a).localeCompare(String(b), "en", {numeric:true}));
}

function toInt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function setToPipe(set) {
  if (!set || set.size === 0) return "";
  return Array.from(set).sort().join("|");
}

function escapeCsvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function vehicleMatchesFilters(v) {
  const f = state.filters;

  const y = toInt(v.year);
  if (f.yearFrom !== null && y !== null && y < f.yearFrom) return false;
  if (f.yearTo !== null && y !== null && y > f.yearTo) return false;

  if (f.make.size && !f.make.has(v.make)) return false;
  if (f.model.size && !f.model.has(v.model)) return false;
  if (f.engine.size && !f.engine.has(v.engine)) return false;
  if (f.trans.size && !f.trans.has(v.trans)) return false;
  if (f.propul.size && !f.propul.has(v.propul)) return false;
  if (f.fuel.size && !f.fuel.has(v.fuel)) return false;

  return true;
}

function getFilteredVehicles() {
  return state.vehicles.filter(vehicleMatchesFilters);
}

function getAvailability(baseVehicles) {
  return {
    makes: uniqSorted(baseVehicles.map(v => v.make)),
    models: uniqSorted(baseVehicles.map(v => v.model)),
    engines: uniqSorted(baseVehicles.map(v => v.engine)),
    trans: uniqSorted(baseVehicles.map(v => v.trans)),
    propul: uniqSorted(baseVehicles.map(v => v.propul)),
    fuel: uniqSorted(baseVehicles.map(v => v.fuel)),
    years: uniqSorted(baseVehicles.map(v => toInt(v.year)).filter(n => n !== null)),
  };
}

function vehiclesWithAllFiltersExcept(exceptKey) {
  const saved = new Set(state.filters[exceptKey]);
  state.filters[exceptKey] = new Set();
  const base = getFilteredVehicles();
  state.filters[exceptKey] = saved;
  return base;
}

function clampYearRangeToAvailable(avYears) {
  if (!avYears.length) {
    state.filters.yearFrom = null;
    state.filters.yearTo = null;
    return;
  }
  const minY = avYears[0];
  const maxY = avYears[avYears.length - 1];

  if (state.filters.yearFrom === null) state.filters.yearFrom = minY;
  if (state.filters.yearTo === null) state.filters.yearTo = maxY;

  if (state.filters.yearFrom < minY) state.filters.yearFrom = minY;
  if (state.filters.yearTo > maxY) state.filters.yearTo = maxY;
  if (state.filters.yearFrom > state.filters.yearTo) state.filters.yearFrom = state.filters.yearTo;
}

function buildCheckboxList(containerId, values, selectedSet, onChange) {
  const el = $(containerId);
  el.innerHTML = "";

  if (!values.length) {
    el.innerHTML = `<div class="muted">Aucune valeur disponible.</div>`;
    return;
  }

  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Rechercher…";
  search.className = "search";
  el.appendChild(search);

  const list = document.createElement("div");
  list.className = "checklist";
  el.appendChild(list);

  function render(filterText) {
    list.innerHTML = "";
    const ft = (filterText || "").trim().toLowerCase();
    const subset = values.filter(v => String(v).toLowerCase().includes(ft));

    const quick = document.createElement("div");
    quick.className = "quick";
    quick.innerHTML = `
      <button type="button" class="btn small" data-q="all">Tout</button>
      <button type="button" class="btn small" data-q="none">Aucun</button>
    `;
    quick.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const q = b.getAttribute("data-q");
      if (q === "all") {
        selectedSet.clear();
        subset.forEach(v => selectedSet.add(v));
      } else {
        selectedSet.clear();
      }
      onChange();
      render(search.value);
    });
    list.appendChild(quick);

    subset.forEach(v => {
      const id = `${containerId}-${String(v).replace(/\W+/g, "_")}`;
      const row = document.createElement("label");
      row.className = "row";
      row.innerHTML = `
        <input type="checkbox" id="${id}">
        <span>${String(v)}</span>
      `;
      const cb = row.querySelector("input");
      cb.checked = selectedSet.has(v);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedSet.add(v);
        else selectedSet.delete(v);
        onChange();
      });
      list.appendChild(row);
    });

    const count = document.createElement("div");
    count.className = "muted tiny";
    count.textContent = `${subset.length} valeur(s) affichée(s) / ${values.length}`;
    list.appendChild(count);
  }

  search.addEventListener("input", () => render(search.value));
  render("");
}

function buildYearRange(years) {
  const fromSel = $("year_from");
  const toSel = $("year_to");

  fromSel.innerHTML = "";
  toSel.innerHTML = "";

  if (!years.length) {
    fromSel.disabled = true;
    toSel.disabled = true;
    return;
  }
  fromSel.disabled = false;
  toSel.disabled = false;

  clampYearRangeToAvailable(years);

  years.forEach(y => {
    const o1 = document.createElement("option");
    o1.value = String(y);
    o1.textContent = String(y);
    fromSel.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = String(y);
    o2.textContent = String(y);
    toSel.appendChild(o2);
  });

  fromSel.value = String(state.filters.yearFrom);
  toSel.value = String(state.filters.yearTo);

  fromSel.onchange = () => {
    state.filters.yearFrom = toInt(fromSel.value);
    if (state.filters.yearTo !== null && state.filters.yearFrom > state.filters.yearTo) {
      state.filters.yearTo = state.filters.yearFrom;
      toSel.value = String(state.filters.yearTo);
    }
    refreshUI();
  };
  toSel.onchange = () => {
    state.filters.yearTo = toInt(toSel.value);
    if (state.filters.yearFrom !== null && state.filters.yearFrom > state.filters.yearTo) {
      state.filters.yearFrom = state.filters.yearTo;
      fromSel.value = String(state.filters.yearFrom);
    }
    refreshUI();
  };
}

function fillMaintenanceDropdown() {
  const sel = $("maint_code");
  sel.innerHTML = `<option value="">— Choisir —</option>`;
  state.maintTypes.forEach(m => {
    const code = m.maint_code || m.maint_c || m.code || m.maintenance_code || "";
    const name = m.maint_name || m.name || code;
    if (!code) return;
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} — ${name}`;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    state.ui.selectedMaintCode = sel.value;
  };
}

function readRuleForm() {
  state.ui.selectedMaintCode = $("maint_code").value.trim();
  state.ui.cost = $("cost").value.trim();
  state.ui.retail = $("retail").value.trim();
  state.ui.firstMonths = $("first_months").value.trim();
  state.ui.firstKm = $("first_km").value.trim();
  state.ui.repeatMonths = $("repeat_months").value.trim();
  state.ui.repeatKm = $("repeat_km").value.trim();
}

function validateRule() {
  readRuleForm();
  if (!state.ui.selectedMaintCode) return "Choisis un entretien (maint_code).";

  const numFields = [
    ["cost", state.ui.cost],
    ["retail", state.ui.retail],
    ["first_months", state.ui.firstMonths],
    ["first_km", state.ui.firstKm],
    ["repeat_months", state.ui.repeatMonths],
    ["repeat_km", state.ui.repeatKm],
  ];
  for (const [k,v] of numFields) {
    if (!v) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) return `Valeur invalide pour ${k}: "${v}"`;
  }
  return null;
}

function addRule() {
  const err = validateRule();
  if (err) { alert(err); return; }

  const nextId = state.savedRules.length
    ? Math.max(...state.savedRules.map(r => toInt(r.rule_id) || 0)) + 1
    : 1;

  const rule = {
    rule_id: String(nextId),
    maint_code: state.ui.selectedMaintCode,
    cost: state.ui.cost,
    retail: state.ui.retail,
    make: setToPipe(state.filters.make),
    model: setToPipe(state.filters.model),
    year_from: state.filters.yearFrom === null ? "" : String(state.filters.yearFrom),
    year_to: state.filters.yearTo === null ? "" : String(state.filters.yearTo),
    engine: setToPipe(state.filters.engine),
    trans: setToPipe(state.filters.trans),
    propul: setToPipe(state.filters.propul),
    fuel: setToPipe(state.filters.fuel),
    first_months: state.ui.firstMonths,
    first_km: state.ui.firstKm,
    repeat_months: state.ui.repeatMonths,
    repeat_km: state.ui.repeatKm,
    trigger_logic: "OR"
  };

  state.savedRules.push(rule);
  renderRulesTable();
}

function exportAssignments() {
  const lines = [];
  lines.push(ASSIGNMENT_HEADER.join(","));
  state.savedRules.forEach(r => {
    const row = ASSIGNMENT_HEADER.map(h => escapeCsvCell(r[h] ?? ""));
    lines.push(row.join(","));
  });
  downloadText("assignments_export.csv", lines.join("\n"));
}

function refreshUI() {
  const makeAvail = getAvailability(vehiclesWithAllFiltersExcept("make")).makes;
  const modelAvail = getAvailability(vehiclesWithAllFiltersExcept("model")).models;
  const engineAvail = getAvailability(vehiclesWithAllFiltersExcept("engine")).engines;
  const transAvail = getAvailability(vehiclesWithAllFiltersExcept("trans")).trans;
  const propulAvail = getAvailability(vehiclesWithAllFiltersExcept("propul")).propul;
  const fuelAvail = getAvailability(vehiclesWithAllFiltersExcept("fuel")).fuel;

  const yearBase = (() => {
    const savedFrom = state.filters.yearFrom;
    const savedTo = state.filters.yearTo;
    state.filters.yearFrom = null;
    state.filters.yearTo = null;
    const base = getFilteredVehicles();
    state.filters.yearFrom = savedFrom;
    state.filters.yearTo = savedTo;
    return base;
  })();
  const yearsAvail = getAvailability(yearBase).years;

  function prune(set, avail) {
    const a = new Set(avail);
    for (const v of Array.from(set)) if (!a.has(v)) set.delete(v);
  }
  prune(state.filters.make, makeAvail);
  prune(state.filters.model, modelAvail);
  prune(state.filters.engine, engineAvail);
  prune(state.filters.trans, transAvail);
  prune(state.filters.propul, propulAvail);
  prune(state.filters.fuel, fuelAvail);

  buildCheckboxList("make_list", makeAvail, state.filters.make, refreshUI);
  buildCheckboxList("model_list", modelAvail, state.filters.model, refreshUI);
  buildCheckboxList("engine_list", engineAvail, state.filters.engine, refreshUI);
  buildCheckboxList("trans_list", transAvail, state.filters.trans, refreshUI);
  buildCheckboxList("propul_list", propulAvail, state.filters.propul, refreshUI);
  buildCheckboxList("fuel_list", fuelAvail, state.filters.fuel, refreshUI);

  buildYearRange(yearsAvail);

  const matched = getFilteredVehicles();
  $("match_count").textContent = String(matched.length);

  const preview = matched.slice(0, 50);
  const rows = preview.map(v =>
    `<tr>
      <td>${v.year ?? ""}</td>
      <td>${v.make ?? ""}</td>
      <td>${v.model ?? ""}</td>
      <td>${v.engine ?? ""}</td>
      <td>${v.trans ?? ""}</td>
      <td>${v.propul ?? ""}</td>
      <td>${v.fuel ?? ""}</td>
    </tr>`
  ).join("");
  $("preview_body").innerHTML = rows || `<tr><td colspan="7" class="muted">Aucun résultat.</td></tr>`;
}

function renderRulesTable() {
  const tbody = $("rules_body");
  if (!state.savedRules.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Aucune règle sauvegardée.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.savedRules.map(r => `
    <tr>
      <td>${r.rule_id}</td>
      <td>${r.maint_code}</td>
      <td>${r.cost}</td>
      <td>${r.retail}</td>
      <td>${r.year_from}–${r.year_to}</td>
      <td><code>${[r.make,r.model,r.engine,r.trans,r.propul,r.fuel].filter(Boolean).join(" | ") || "ALL"}</code></td>
    </tr>
  `).join("");
}

async function init() {
  $("status").textContent = "Chargement des CSV…";

  const vehiclesRaw = await parseCSV(VEHICLES_CSV);

  state.vehicles = vehiclesRaw.map(v => ({
    id: v.id ?? v.ID ?? v.vehicle_id ?? "",
    year: v.year ?? v.Year ?? "",
    make: v.make ?? v.Make ?? "",
    model: v.model ?? v.Model ?? "",
    engine: v.engine ?? v.Engine ?? "",
    trans: v.trans ?? v.Trans ?? "",
    propul: v.propul ?? v.drive ?? v.Propul ?? v.Drive ?? "",
    fuel: v.fuel ?? v.Fuel ?? "",
  })).filter(v => String(v.year).trim() !== "" && String(v.make).trim() !== "" && String(v.model).trim() !== "");

  state.maintTypes = await parseCSV(MAINT_TYPES_CSV);

  fillMaintenanceDropdown();

  const allYears = uniqSorted(state.vehicles.map(v => toInt(v.year)).filter(n => n !== null));
  if (allYears.length) {
    state.filters.yearFrom = allYears[0];
    state.filters.yearTo = allYears[allYears.length - 1];
  }

  $("save_rule").addEventListener("click", addRule);
  $("export_assignments").addEventListener("click", exportAssignments);

  $("status").textContent = "Prêt.";
  refreshUI();
  renderRulesTable();
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error(err);
    $("status").textContent = "Erreur: " + (err?.message || String(err));
  });
});

// app.js — Maintenance demo (no build, runs in browser)
// Requires: PapaParse (loaded in index.html)

const VEHICLES_CSV = "vehicules.csv";
const MAINT_TYPES_CSV = "maintenance_types.csv";
const ASSIGNMENTS_CSV = "assignments.csv"; // optional (for header reference)

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

// ---------- utils ----------
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

function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
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

// ---------- filtering ----------
function vehicleMatchesFilters(v) {
  const f = state.filters;

  // year range (always treated as inclusive if set)
  const y = toInt(v.year);
  if (f.yearFrom !== null && y !== null && y < f.yearFrom) return false;
  if (f.yearTo !== null && y !== null && y > f.yearTo) return false;

  // multi-select filters: if set is empty => "all"
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

// Compute available values for each filter based on *current* other filters
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

// For cascading: when computing availability for a given field, ignore that field's current selection
function vehiclesWithAllFiltersExcept(exceptKey) {
  const original = state.filters[exceptKey];
  const saved = new Set(original);
  // Temporarily clear that filter
  state.filters[exceptKey] = new Set();
  const base = getFilteredVehicles(); // uses other filters
  // Restore
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

// ---------- UI builders ----------
function buildCheckboxList(containerId, values, selectedSet, onChange) {
  const el = $(containerId);
  el.innerHTML = "";

  if (!values.length) {
    el.innerHTML = `<div class="muted">Aucune valeur disponible.</div>`;
    return;
  }

  // Search box
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

    // All / none quick actions
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
    const code = m.maint_code || m.code || m.maintenance_code || "";
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

  // basic numeric checks (allow blank)
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

  // year range must exist (we allow null if no years, but then matching is empty anyway)
  if (state.filters.yearFrom !== null && state.filters.yearTo !== null && state.filters.yearFrom > state.filters.yearTo) {
    return "Plage d'années invalide.";
  }

  return null;
}

function addRule() {
  const err = validateRule();
  if (err) {
    alert(err);
    return;
  }

  const nextId = state.savedRules.length ? Math.max(...state.savedRules.map(r => toInt(r.rule_id) || 0)) + 1 : 1;

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

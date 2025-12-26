/* global initSqlJs */

const state = {
  db: null,
  table: "funguild",
  limit: 50,
  offset: 0,
  total: 0,
  lastDetail: null,
};

const el = (id) => document.getElementById(id);

// Inputs
const fTaxon = el("fTaxon");
const fTrophicMode = el("fTrophicMode");
const fGrowthForm = el("fGrowthForm");
const fGuild = el("fGuild");

// Metadata regarding filters to help with iteration
const FILTERS = [
  { id: "fTaxon", field: "taxon", type: "text" },
  { id: "fTrophicMode", field: "trophicMode", type: "select" },
  { id: "fGrowthForm", field: "growthForm", type: "select" },
  { id: "fGuild", field: "guild", type: "select" },
];

const tbody = el("tbody");
const metaText = el("metaText");
const statusEl = el("status");

// Modal
const modalBackdrop = el("modalBackdrop");
const modalTitle = el("modalTitle");
const modalBody = el("modalBody");

el("btnClose").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
el("btnCopy").addEventListener("click", async () => {
  if (!state.lastDetail) return;
  await navigator.clipboard.writeText(JSON.stringify(state.lastDetail, null, 2));
});

// --- Event Listeners for Filters ---
// "Reset" button
el("btnReset").addEventListener("click", () => {
  fTaxon.value = "";
  fTrophicMode.value = "";
  fGrowthForm.value = "";
  fGuild.value = "";
  state.offset = 0;
  onFilterChange();
});

// "Apply" button (optional now, but good for explicit action)
el("btnApply").addEventListener("click", () => {
  onFilterChange();
});

// Attach listeners to inputs for auto-cascading behavior
// For select dropdowns: change immediately triggers update
[fTrophicMode, fGrowthForm, fGuild].forEach(input => {
  input.addEventListener("change", () => {
    state.offset = 0; // Reset pagination
    onFilterChange();
  });
});

// For text input: use 'input' with debounce or just 'change' (blur/enter).
// To be "faceted search" style, usually 'input' + debounce is best, but strictly 'change' is safer for performance without debounce.
// Let's use 'change' for now to be safe with SQL.
fTaxon.addEventListener("change", () => {
  state.offset = 0;
  onFilterChange();
});

// Pagination
el("btnPrev").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadRows();
});
el("btnNext").addEventListener("click", () => {
  const next = state.offset + state.limit;
  if (next >= state.total) return;
  state.offset = next;
  loadRows();
});


// --- Core Cascading Logic ---

function getActiveFilters() {
  return {
    taxon: fTaxon.value.trim(),
    trophicMode: fTrophicMode.value,
    growthForm: fGrowthForm.value,
    guild: fGuild.value,
  };
}

/**
 * Builds the WHERE clause based on active filters.
 * @param {string} [excludeField] - If provided, this field is OMITTED from the WHERE clause.
 *                                  This allows us to find all *possible* values for 'excludeField'
 *                                  given the constraints of the *other* filters.
 * @returns {{ whereSql: string, params: object }}
 */
function buildWhereClause(excludeField = null) {
  const filters = getActiveFilters();
  const parts = [];
  const params = {};

  // Taxon (Text contains)
  if (filters.taxon && excludeField !== "taxon") {
    parts.push(`taxon LIKE :taxon`);
    params[":taxon"] = `%${filters.taxon}%`;
  }

  // TrophicMode (Exact)
  if (filters.trophicMode && excludeField !== "trophicMode") {
    parts.push(`trophicMode = :trophicMode`);
    params[":trophicMode"] = filters.trophicMode;
  }

  // GrowthForm (Exact)
  if (filters.growthForm && excludeField !== "growthForm") {
    parts.push(`growthForm = :growthForm`);
    params[":growthForm"] = filters.growthForm;
  }

  // Guild (Exact)
  if (filters.guild && excludeField !== "guild") {
    parts.push(`guild = :guild`);
    params[":guild"] = filters.guild;
  }

  return {
    whereSql: parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "",
    params
  };
}

/**
 * Updates a specific dropdown's options based on other active filters.
 * @param {HTMLSelectElement} selectEl - The dropdown element
 * @param {string} fieldName - The DB column name (e.g. 'trophicMode')
 */
function updateSingleDropdown(selectEl, fieldName) {
  // 1. Build WHERE clause EXCLUDING this field
  const { whereSql, params } = buildWhereClause(fieldName);

  // 2. Query DISTINCT values compatible with *other* filters
  //    AND ensure we don't pick up null/empty strings
  const sql = `
    SELECT DISTINCT ${fieldName} as v
    FROM ${state.table}
    ${whereSql}
    ${whereSql ? "AND" : "WHERE"} ${fieldName} IS NOT NULL AND ${fieldName} != ''
    ORDER BY ${fieldName} ASC
  `;

  const results = queryAll(sql, params);
  const availableValues = results.map(r => r.v); // array of strings

  // 3. Preserve current selection if valid
  const currentVal = selectEl.value;

  // 4. Re-render options
  //    Always keep the default/empty option
  selectEl.innerHTML = "";

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "(Any)";
  selectEl.appendChild(defaultOpt);

  availableValues.forEach(val => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    selectEl.appendChild(opt);
  });

  // 5. Restore or Clear selection
  if (currentVal && availableValues.includes(currentVal)) {
    selectEl.value = currentVal;
  } else if (currentVal) {
    // Current selection is no longer valid given other filters
    selectEl.value = "";
  }
}

/**
 * Master function to update ALL dropdown options.
 * Only 'select' types need this.
 */
function updateAllDropdowns() {
  FILTERS.forEach(f => {
    if (f.type === "select") {
      const elInput = el(f.id);
      updateSingleDropdown(elInput, f.field);
    }
  });
}

/**
 * Coordinator function called when filters change.
 */
function onFilterChange() {
  // 1. Update dropdown options based on new constraints
  updateAllDropdowns();

  // 2. Refresh the table data
  loadRows();
}


// --- Standard Data Loading ---

function queryAll(sql, params = {}) {
  try {
    const stmt = state.db.prepare(sql);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  } catch (err) {
    console.error("SQL Error:", err.message);
    return [];
  }
}

function queryOne(sql, params = {}) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function loadRows() {
  metaText.textContent = "Loading…";
  tbody.innerHTML = "";

  // For the main table, we include ALL filters (excludeField = null)
  const { whereSql, params } = buildWhereClause(null);

  const countRow = queryOne(
    `SELECT COUNT(*) AS total FROM ${state.table} ${whereSql}`,
    params
  );
  state.total = Number(countRow?.total ?? 0);

  const rows = queryAll(
    `SELECT guid, taxon, trophicMode, growthForm, guild
     FROM ${state.table}
     ${whereSql}
     ORDER BY taxon COLLATE NOCASE ASC
     LIMIT :limit OFFSET :offset`,
    { ...params, ":limit": state.limit, ":offset": state.offset }
  );

  metaText.textContent = `Showing ${rows.length} / ${state.total} (offset ${state.offset}, limit ${state.limit})`;

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Taxon">${escapeHtml(r.taxon ?? "")}</td>
      <td data-label="TrophicMode">${escapeHtml(r.trophicMode ?? "")}</td>
      <td data-label="GrowthForm">${escapeHtml(r.growthForm ?? "")}</td>
      <td data-label="Guild">${escapeHtml(r.guild ?? "")}</td>
    `;
    tr.addEventListener("click", () => loadDetail(r.guid));
    tbody.appendChild(tr);
  }
}

async function loadDetail(guid) {
  const row = queryOne(
    `SELECT * FROM ${state.table} WHERE guid = :guid`,
    { ":guid": guid }
  );
  if (!row) return;
  openModal(row);
}


// --- Helper Utils ---

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Transforms citation text into safe HTML with clickable links.
 * Detects http(s) URLs and wraps them in <a> tags.
 * Handles trailing punctuation/parentheses robustly.
 */
function renderCitationSource(text) {
  if (!text) return "—";

  // Regex to find potential URLs starting with http:// or https://
  // We grab non-whitespace chars aggressively, then clean up trailing chars.
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Split text by URL patterns
  // split with capture group returns [text, url, text, url...]
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    // Even indices are plain text
    if (index % 2 === 0) {
      return escapeHtml(part);
    }

    // Odd indices are potential URLs matches
    let url = part;
    let trailing = "";

    // Heuristic: move trailing punctuation out of the URL
    // Loop while the url ends with a common punctuation mark or unbalanced parens
    while (true) {
      const lastChar = url.slice(-1);

      // Common sentence punctuation that is rarely part of a URL
      if ([".", ",", ";", "!", "?"].includes(lastChar)) {
        trailing = lastChar + trailing;
        url = url.slice(0, -1);
        continue;
      }

      // Balanced parentheses check
      // If URL ends in ')', check if it contains a matching '('
      if (lastChar === ")") {
        const openCount = (url.match(/\(/g) || []).length;
        const closeCount = (url.match(/\)/g) || []).length;
        if (closeCount > openCount) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
          continue;
        }
      }

      break;
    }

    // Now render the link + the stripped trailing text
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;

  }).join("");
}

function openModal(detail) {
  state.lastDetail = detail;
  modalTitle.textContent = detail.taxon ? `${detail.taxon}` : `Record ${detail.guid}`;
  modalBody.innerHTML = "";

  const keys = Object.keys(detail).sort((a, b) => {
    // Custom sort order: guid first, taxon second, then alphabetical
    const pri = (k) => (k === "guid" ? 0 : k === "taxon" ? 1 : 2);
    const pa = pri(a), pb = pri(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  for (const k of keys) {
    const row = document.createElement("div");
    row.className = "kv";

    const keyEl = document.createElement("div");
    keyEl.className = "k";
    keyEl.textContent = k;

    const valEl = document.createElement("div");
    valEl.className = "v";

    // Special handling for citationSource
    if (k === "citationSource") {
      valEl.innerHTML = renderCitationSource(detail[k]);
    } else {
      valEl.textContent = detail[k] == null ? "NULL" : String(detail[k]);
    }

    row.appendChild(keyEl);
    row.appendChild(valEl);
    modalBody.appendChild(row);
  }

  modalBackdrop.style.display = "flex";
}

function closeModal() {
  modalBackdrop.style.display = "none";
  state.lastDetail = null;
}


// --- Initialization ---

async function loadSqliteDb() {
  statusEl.textContent = "Loading SQLite…";

  const SQL = await initSqlJs({
    locateFile: (file) => `./${file}`,
  });

  const res = await fetch("./funguild.sqlite");
  if (!res.ok) throw new Error(`Failed to fetch funguild.sqlite (HTTP ${res.status})`);

  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);

  state.db = new SQL.Database(u8);

  // Validate table
  const t = queryOne(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=:t`,
    { ":t": state.table }
  );
  if (!t) {
    throw new Error(`Table "${state.table}" not found. Update state.table in app.js if needed.`);
  }

  statusEl.textContent = "Ready";
}


(async function init() {
  try {
    await loadSqliteDb();

    // Initial Load:
    // 1. Populate all dropdowns (with no filters active yet)
    updateAllDropdowns();
    // 2. Load initial rows
    loadRows();

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error";
    metaText.textContent = String(err?.message ?? err);
  }
})();

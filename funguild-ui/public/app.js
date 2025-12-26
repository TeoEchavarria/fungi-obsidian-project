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

  // Container
  const grid = document.createElement("div");
  grid.className = "modal-grid";

  // --- Left Column (Narrative) ---
  const leftCol = document.createElement("div");
  leftCol.className = "modal-col-left";

  // Image Placeholder
  const imgPlaceholder = document.createElement("div");
  imgPlaceholder.className = "placeholder-image";
  imgPlaceholder.textContent = "No Image";
  leftCol.appendChild(imgPlaceholder);

  // Notes
  if (detail.notes) {
    const notesTitle = document.createElement("span");
    notesTitle.className = "section-title";
    notesTitle.textContent = "Notes";

    const notesBody = document.createElement("div");
    notesBody.className = "text-block";
    notesBody.textContent = detail.notes;

    leftCol.appendChild(notesTitle);
    leftCol.appendChild(notesBody);
  }

  // Citation Source
  if (detail.citationSource) {
    const citTitle = document.createElement("span");
    citTitle.className = "section-title";
    citTitle.textContent = "Citation Source";

    const citBody = document.createElement("div");
    citBody.className = "text-block";
    citBody.innerHTML = renderCitationSource(detail.citationSource);

    leftCol.appendChild(citTitle);
    leftCol.appendChild(citBody);
  }

  // --- Right Column (Metadata) ---
  const rightCol = document.createElement("div");
  rightCol.className = "modal-col-right";

  // Define fields to show in order
  const metaFields = [
    "taxon",
    "guid",
    "mbNumber",
    "taxonomicLevel",
    "trophicMode",
    "guild",
    "growthForm",
    "confidenceRanking",
    "trait",
    "ingested_at"
  ];

  metaFields.forEach(key => {
    const val = detail[key];
    // Show only if meaningful? The prompt says "Display all remaining fields". 
    // We will display them (showing NULL if empty is fine or we can skip empty ones).
    // Let's stick to showing them to be explicit.

    const row = document.createElement("div");
    row.className = "kv-pair";

    const label = document.createElement("div");
    label.className = "kv-label";
    label.textContent = key;

    const value = document.createElement("div");
    value.className = "kv-value";
    value.textContent = (val === null || val === undefined || val === "") ? "—" : String(val);

    row.appendChild(label);
    row.appendChild(value);
    rightCol.appendChild(row);
  });

  // Assemble
  grid.appendChild(leftCol);
  grid.appendChild(rightCol);
  modalBody.appendChild(grid);

  // Check Permissions for Edit Button
  const btnEdit = el("btnEditRecord");
  if (AuthService.user && state.userProfile?.can_edit) {
    btnEdit.style.display = "block";
    btnEdit.onclick = () => {
      alert(`Editing Record ${detail.guid}\n\n(This would open the editor if the backend supported writes. You have permission!)`);
    };
  } else {
    btnEdit.style.display = "none";
  }

  modalBackdrop.style.display = "flex";
}

// --- Comments System ---


/**
 * Load comments for a specific record from the API
 * @param {string} recordGuid - The GUID of the record
 * @returns {Promise<Array>} Array of comment objects
 */
async function loadComments(recordGuid) {
  try {
    const response = await fetch(`/api/comments?record_guid=${encodeURIComponent(recordGuid)}`);
    if (!response.ok) {
      console.error('Failed to load comments:', response.statusText);
      return [];
    }
    const data = await response.json();
    return data.comments || [];
  } catch (error) {
    console.error('Error loading comments:', error);
    return [];
  }
}

/**
 * Submit a new comment for a record
 * @param {string} recordGuid - The GUID of the record
 * @param {string} content - The comment content
 * @returns {Promise<Object>} The created comment object
 */
async function submitComment(recordGuid, content) {
  const user = AuthService.user;
  if (!user?.email) {
    throw new Error('You must be logged in to comment');
  }

  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.email}`
    },
    body: JSON.stringify({
      record_guid: recordGuid,
      content: content.trim()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit comment');
  }

  return response.json();
}

/**
 * Format a date to human-readable string
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string
 */
function formatCommentDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  // Format as readable date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Render comments section in the modal
 * @param {Array} comments - Array of comment objects
 * @param {string} recordGuid - The GUID of the record
 * @returns {HTMLElement} Comments section element
 */
function renderComments(comments, recordGuid) {
  const section = document.createElement('div');
  section.className = 'comments-section';

  // Header
  const header = document.createElement('div');
  header.className = 'comments-header';
  header.innerHTML = `
    Comments
    <span class="comments-count">${comments.length}</span>
  `;
  section.appendChild(header);

  // Comments list
  if (comments.length > 0) {
    const list = document.createElement('div');
    list.className = 'comments-list';

    comments.forEach(comment => {
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(comment.author_email)}</span>
          <span class="comment-date">${formatCommentDate(comment.created_at)}</span>
        </div>
        <div class="comment-content">${escapeHtml(comment.content)}</div>
      `;
      list.appendChild(card);
    });

    section.appendChild(list);
  } else {
    const empty = document.createElement('div');
    empty.className = 'comments-empty';
    empty.textContent = 'No comments yet. Be the first to comment!';
    section.appendChild(empty);
  }

  // Comment form or login prompt
  if (AuthService.user) {
    section.appendChild(renderCommentForm(recordGuid));
  } else {
    section.appendChild(renderLoginPrompt());
  }

  return section;
}

/**
 * Render the comment input form
 * @param {string} recordGuid - The GUID of the record
 * @returns {HTMLElement} Comment form element
 */
function renderCommentForm(recordGuid) {
  const form = document.createElement('div');
  form.className = 'comment-form';

  form.innerHTML = `
    <div class="comment-form-header">Add a comment</div>
    <div class="comment-input-wrapper">
      <textarea 
        class="comment-textarea" 
        placeholder="Share your thoughts about this record..."
        maxlength="1000"
        id="commentTextarea-${recordGuid}"
      ></textarea>
      <div class="comment-char-count" id="charCount-${recordGuid}">0 / 1000</div>
    </div>
    <div class="comment-form-actions">
      <div class="comment-error" id="commentError-${recordGuid}"></div>
      <button class="comment-submit-btn" id="submitComment-${recordGuid}">
        Post Comment
      </button>
    </div>
  `;

  // Add event listeners after adding to DOM
  setTimeout(() => {
    const textarea = document.getElementById(`commentTextarea-${recordGuid}`);
    const charCount = document.getElementById(`charCount-${recordGuid}`);
    const submitBtn = document.getElementById(`submitComment-${recordGuid}`);
    const errorDiv = document.getElementById(`commentError-${recordGuid}`);

    if (!textarea || !submitBtn) return;

    // Character count update
    textarea.addEventListener('input', () => {
      const length = textarea.value.length;
      charCount.textContent = `${length} / 1000`;

      charCount.classList.remove('warning', 'error');
      if (length > 900) charCount.classList.add('error');
      else if (length > 800) charCount.classList.add('warning');
    });

    // Submit handler
    submitBtn.addEventListener('click', async () => {
      const content = textarea.value.trim();
      errorDiv.textContent = '';

      // Validation
      if (!content) {
        errorDiv.textContent = 'Comment cannot be empty';
        return;
      }

      if (content.length > 1000) {
        errorDiv.textContent = 'Comment cannot exceed 1000 characters';
        return;
      }

      // Submit
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting...';

      try {
        await submitComment(recordGuid, content);

        // Reload comments
        const comments = await loadComments(recordGuid);

        // Find and replace the comments section
        const modalBody = document.getElementById('modalBody');
        const oldSection = modalBody.querySelector('.comments-section');
        if (oldSection) {
          const newSection = renderComments(comments, recordGuid);
          oldSection.replaceWith(newSection);
        }
      } catch (error) {
        errorDiv.textContent = error.message || 'Failed to post comment';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post Comment';
      }
    });
  }, 0);

  return form;
}

/**
 * Render login prompt for non-authenticated users
 * @returns {HTMLElement} Login prompt element
 */
function renderLoginPrompt() {
  const prompt = document.createElement('div');
  prompt.className = 'comment-login-prompt';

  prompt.innerHTML = `
    <p>Please log in to leave a comment</p>
    <button class="comment-login-btn" id="commentLoginBtn">Log In</button>
  `;

  setTimeout(() => {
    const loginBtn = prompt.querySelector('#commentLoginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        closeModal();
        btnAuth.click();
      });
    }
  }, 0);

  return prompt;
}

function openModal(detail) {
  state.lastDetail = detail;
  modalTitle.textContent = detail.taxon ? `${detail.taxon}` : `Record ${detail.guid}`;
  modalBody.innerHTML = "";

  // Container
  const grid = document.createElement("div");
  grid.className = "modal-grid";

  // --- Left Column (Narrative) ---
  const leftCol = document.createElement("div");
  leftCol.className = "modal-col-left";

  // Image Placeholder
  const imgPlaceholder = document.createElement("div");
  imgPlaceholder.className = "placeholder-image";
  imgPlaceholder.textContent = "No Image";
  leftCol.appendChild(imgPlaceholder);

  // Notes
  if (detail.notes) {
    const notesTitle = document.createElement("span");
    notesTitle.className = "section-title";
    notesTitle.textContent = "Notes";

    const notesBody = document.createElement("div");
    notesBody.className = "text-block";
    notesBody.textContent = detail.notes;

    leftCol.appendChild(notesTitle);
    leftCol.appendChild(notesBody);
  }

  // Citation Source
  if (detail.citationSource) {
    const citTitle = document.createElement("span");
    citTitle.className = "section-title";
    citTitle.textContent = "Citation Source";

    const citBody = document.createElement("div");
    citBody.className = "text-block";
    citBody.innerHTML = renderCitationSource(detail.citationSource);

    leftCol.appendChild(citTitle);
    leftCol.appendChild(citBody);
  }

  // --- Right Column (Metadata) ---
  const rightCol = document.createElement("div");
  rightCol.className = "modal-col-right";

  // Define fields to show in order
  const metaFields = [
    "taxon",
    "guid",
    "mbNumber",
    "taxonomicLevel",
    "trophicMode",
    "guild",
    "growthForm",
    "confidenceRanking",
    "trait",
    "ingested_at"
  ];

  metaFields.forEach(key => {
    const val = detail[key];
    // Show only if meaningful? The prompt says "Display all remaining fields". 
    // We will display them (showing NULL if empty is fine or we can skip empty ones).
    // Let's stick to showing them to be explicit.

    const row = document.createElement("div");
    row.className = "kv-pair";

    const label = document.createElement("div");
    label.className = "kv-label";
    label.textContent = key;

    const value = document.createElement("div");
    value.className = "kv-value";
    value.textContent = (val === null || val === undefined || val === "") ? "—" : String(val);

    row.appendChild(label);
    row.appendChild(value);
    rightCol.appendChild(row);
  });

  // Assemble
  grid.appendChild(leftCol);
  grid.appendChild(rightCol);
  modalBody.appendChild(grid);

  // Load and render comments (async)
  loadComments(detail.guid).then(comments => {
    const commentsSection = renderComments(comments, detail.guid);
    modalBody.appendChild(commentsSection);
  });

  // Check Permissions for Edit Button
  const btnEdit = el("btnEditRecord");
  if (AuthService.user && state.userProfile?.can_edit) {
    btnEdit.style.display = "block";
    btnEdit.onclick = () => {
      alert(`Editing Record ${detail.guid}\n\n(This would open the editor if the backend supported writes. You have permission!)`);
    };
  } else {
    btnEdit.style.display = "none";
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

    // 3. Initialize Auth
    AuthService.initApp();

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error";
    metaText.textContent = String(err?.message ?? err);
  }
})();

// --- Authentication Logic ---

const authModal = el("authModalBackdrop");
const btnAuth = el("btnAuth");
const btnLogout = el("btnLogout");
const btnAuthClose = el("btnAuthClose");
const authTabs = document.querySelectorAll(".auth-tab");
const forms = {
  login: el("formLogin"),
  register: el("formRegister")
};
const authMessage = el("authMessage");
const editorBadge = el("editorBadge");

// Open/Close Modal
btnAuth.addEventListener("click", () => {
  if (AuthService.user) return; // Should be logout button usually
  authModal.style.display = "flex";
  authMessage.textContent = "";
});
btnAuthClose.addEventListener("click", () => authModal.style.display = "none");
authModal.addEventListener("click", (e) => {
  if (e.target === authModal) authModal.style.display = "none";
});

// Switch Tabs
authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    // UI toggle
    authTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    // Form toggle
    const target = tab.dataset.tab;
    Object.values(forms).forEach(f => f.classList.remove("active"));
    forms[target].classList.add("active");
    authMessage.textContent = "";
  });
});

// Login Submit
forms.login.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = el("loginEmail").value;
  const pass = el("loginPass").value;
  authMessage.textContent = "Logging in...";

  try {
    await AuthService.login(email, pass);
    authModal.style.display = "none";
    // Clear forms
    el("loginPass").value = "";
  } catch (err) {
    authMessage.textContent = "Login failed: " + err.message;
  }
});

// Register Submit
forms.register.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = el("regEmail").value;
  const pass = el("regPass").value;
  const just = el("regJustification").value;
  authMessage.textContent = "Registering...";

  try {
    await AuthService.register(email, pass, just);
    authModal.style.display = "none";
    alert("Registration successful! Your request has been submitted for review.");
  } catch (err) {
    authMessage.textContent = "Registration failed: " + err.message;
  }
});

// Logout
btnLogout.addEventListener("click", async () => {
  await AuthService.logout();
});

// Auth State Listener
AuthService.subscribeToAuth(async (user) => {
  if (user) {
    // Logged In
    btnAuth.style.display = "none";
    btnLogout.style.display = "inline-block";
    btnLogout.textContent = "Logout (" + user.profile.email + ")";

    // Fetch Permissions
    // We store profile in state to access it in openModal
    const profile = await AuthService.getProfile();
    state.userProfile = profile;

    if (profile && profile.can_edit) {
      editorBadge.style.display = "inline-block";
    } else {
      editorBadge.style.display = "none";
    }

  } else {
    // Logged Out
    btnAuth.style.display = "inline-block";
    btnLogout.style.display = "none";
    editorBadge.style.display = "none";
    state.userProfile = null;
  }
});

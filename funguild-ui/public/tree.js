/* global initSqlJs, HierarchyUtils, AuthService, SharedUI */

const state = {
    db: null,
    table: "funguild",
    hierarchyOverrides: {},
    userProfile: null,
    paneManager: null,
};

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const treeRoot = el("tree-root");

/**
 * Initialize SQLite DB
 */
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
}

/**
 * Load hierarchy overrides from MongoDB
 */
async function loadHierarchyOverrides() {
    try {
        const res = await fetch('/api/hierarchy');
        if (res.ok) {
            const data = await res.json();
            const overrides = {};
            data.overrides.forEach(o => overrides[o.record_guid] = o.parent_guid);
            state.hierarchyOverrides = overrides;
        }
    } catch (err) {
        console.error("Failed to load hierarchy overrides:", err);
    }
}

/**
 * SQL Helper to fetch records
 */
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

/**
 * Hierarchical data fetching
 */
async function getChildren(parentGuid) {
    const sql = `SELECT * FROM ${state.table} WHERE parent_guid ${parentGuid ? "= :p" : "IS NULL"} ORDER BY taxon ASC`;
    const params = parentGuid ? { ":p": parentGuid } : {};
    let children = queryAll(sql, params);

    // Apply Overrides
    children = children.filter(c => {
        const override = state.hierarchyOverrides[c.guid];
        return override === undefined || override === parentGuid;
    });

    Object.entries(state.hierarchyOverrides).forEach(([childGuid, overrideParentGuid]) => {
        if (overrideParentGuid === parentGuid) {
            if (!children.find(c => c.guid === childGuid)) {
                const node = queryOne(`SELECT * FROM ${state.table} WHERE guid = :g`, { ":g": childGuid });
                if (node) children.push(node);
            }
        }
    });

    return children.sort((a, b) => (a.taxon || "").localeCompare(b.taxon || ""));
}

/**
 * Tree Rendering
 */
async function toggleNode(nodeDiv, parentLi) {
    const isExpanded = nodeDiv.classList.contains("expanded");
    const guid = nodeDiv.dataset.guid;
    const toggleBtn = nodeDiv.querySelector(".tree-node-toggle");

    let childrenContainer = parentLi.querySelector(".tree-children");

    if (isExpanded) {
        nodeDiv.classList.remove("expanded");
        if (toggleBtn) toggleBtn.textContent = "▶";
        if (childrenContainer) childrenContainer.classList.remove("open");
    } else {
        nodeDiv.classList.add("expanded");
        if (toggleBtn) toggleBtn.textContent = "▼";

        if (!childrenContainer) {
            const loading = document.createElement("div");
            loading.className = "node-loading";
            loading.textContent = "Loading children...";
            parentLi.appendChild(loading);

            try {
                const children = await getChildren(guid);
                loading.remove();

                childrenContainer = document.createElement("div");
                childrenContainer.className = "tree-children open";

                if (children.length > 0) {
                    const ul = renderNodes(children);
                    childrenContainer.appendChild(ul);
                } else {
                    const noChild = document.createElement("div");
                    noChild.className = "node-loading";
                    noChild.textContent = "No descendants found";
                    childrenContainer.appendChild(noChild);
                }

                parentLi.appendChild(childrenContainer);
            } catch (err) {
                loading.textContent = "Error loading children";
                console.error(err);
            }
        } else {
            childrenContainer.classList.add("open");
        }
    }
}

function renderNodes(nodes) {
    const ul = document.createElement("ul");
    ul.className = "tree-node-list";

    nodes.forEach(node => {
        const li = document.createElement("li");
        li.className = "tree-node-item";

        const nodeDiv = document.createElement("div");
        nodeDiv.className = "tree-node";
        nodeDiv.dataset.guid = node.guid;

        nodeDiv.innerHTML = `
            <span class="tree-node-toggle">▶</span>
            <span class="tree-node-label">${SharedUI.escapeHtml(node.taxon || "Unknown")}</span>
            <span class="tree-node-level">L${node.taxonomicLevel}</span>
        `;

        nodeDiv.querySelector(".tree-node-toggle").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleNode(nodeDiv, li);
        });

        nodeDiv.addEventListener("click", () => {
            SharedUI.loadDetail(node.guid, state);
        });

        li.appendChild(nodeDiv);
        ul.appendChild(li);
    });

    return ul;
}

window.openModal = (detail) => SharedUI.loadDetail(detail.guid, state);
window.getParentMap = () => {
    const map = {};
    const rows = queryAll(`SELECT guid, parent_guid FROM funguild WHERE parent_guid IS NOT NULL`);
    rows.forEach(r => map[r.guid] = r.parent_guid);
    Object.assign(map, state.hierarchyOverrides);
    return map;
};

/**
 * Main Init
 */
(async function init() {
    try {
        await loadSqliteDb();
        await loadHierarchyOverrides();
        statusEl.textContent = "Ready";

        const anchor = queryOne(`SELECT * FROM ${state.table} WHERE guid = 'F_0000000000_ANCHOR_FUNGI'`);
        if (!anchor) {
            treeRoot.textContent = "Anchor node 'Fungi' not found.";
            return;
        }

        const ul = renderNodes([anchor]);
        treeRoot.appendChild(ul);

        // Auto-expand anchor
        const firstLi = ul.querySelector("li");
        const firstNode = firstLi.querySelector(".tree-node");
        toggleNode(firstNode, firstLi);

    } catch (err) {
        console.error(err);
        statusEl.textContent = "Error";
    }
})();

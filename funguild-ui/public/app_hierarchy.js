/**
 * Hierarchy UI Extension
 * Hooks into the existing modal to add Parent selection.
 */

(function () {
    // Wait for the original openModal to be defined
    const originalOpenModal = window.openModal;

    window.openModal = function (detail) {
        // Call original first to build the base UI
        originalOpenModal.apply(this, arguments);

        const modalBody = document.getElementById("modalBody");
        const rightCol = modalBody.querySelector(".modal-col-right");

        if (!rightCol) return;

        // --- Taxonomic Parent Section ---
        const parentSection = document.createElement("div");
        parentSection.className = "comments-section"; // Reuse section styling
        parentSection.style.marginTop = "24px";
        parentSection.style.borderTop = "2px solid var(--border)";
        parentSection.style.paddingTop = "16px";

        const parentHeader = document.createElement("div");
        parentHeader.className = "comments-header";
        parentHeader.textContent = "Taxonomic Parent";
        parentSection.appendChild(parentHeader);

        const parentMap = getParentMap();
        const currentParentGuid = (state.hierarchyOverrides && state.hierarchyOverrides[detail.guid]) || detail.parent_guid;
        let currentParentTaxon = "None (Anchor Root)";

        if (currentParentGuid) {
            const p = queryOne(`SELECT taxon FROM ${state.table} WHERE guid = :p`, { ":p": currentParentGuid });
            if (p) currentParentTaxon = p.taxon;
        }

        const parentDisplay = document.createElement("div");
        parentDisplay.style.marginBottom = "12px";
        parentDisplay.innerHTML = `<strong>Current Parent:</strong> <span id="currentParentLabel">${escapeHtml(currentParentTaxon)}</span>`;
        parentSection.appendChild(parentDisplay);

        if (AuthService.user && state.userProfile?.can_edit) {
            const parentForm = document.createElement("div");
            parentForm.innerHTML = `
                <div class="filter-item" style="margin-bottom: 8px;">
                    <label>Search New Parent</label>
                    <input type="text" id="parentSearch" placeholder="Type taxon name..." />
                </div>
                <div id="parentResults" style="max-height: 150px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; display: none; margin-bottom: 8px; background: #fff;"></div>
                <button id="btnSaveParent" class="comment-submit-btn" disabled>Save Parent</button>
                <div id="parentStatus" style="font-size: 12px; margin-top: 4px;"></div>
            `;
            parentSection.appendChild(parentForm);

            // Using microtask to wait for DOM to be ready
            setTimeout(() => {
                const pSearch = document.getElementById("parentSearch");
                const pResults = document.getElementById("parentResults");
                const btnSave = document.getElementById("btnSaveParent");
                const pStatus = document.getElementById("parentStatus");
                let selectedParent = null;

                if (!pSearch) return;

                pSearch.addEventListener("input", () => {
                    const val = pSearch.value.trim();
                    if (val.length < 2) {
                        pResults.style.display = "none";
                        return;
                    }

                    const candidates = queryAll(
                        `SELECT guid, taxon, taxonomicLevel FROM ${state.table} 
                         WHERE taxon LIKE :q AND guid != :self 
                         ORDER BY taxon ASC LIMIT 10`,
                        { ":q": `%${val}%`, ":self": detail.guid }
                    );

                    pResults.innerHTML = "";
                    if (candidates.length > 0) {
                        candidates.forEach(c => {
                            const item = document.createElement("div");
                            item.className = "kv-pair";
                            item.style.padding = "8px";
                            item.style.cursor = "pointer";
                            item.innerHTML = `<div class="kv-value">${escapeHtml(c.taxon)} (L${c.taxonomicLevel})</div>`;
                            item.addEventListener("click", () => {
                                const validation = HierarchyUtils.validateParent(detail, c, getParentMap());
                                if (validation.ok) {
                                    selectedParent = c;
                                    pSearch.value = c.taxon;
                                    pResults.style.display = "none";
                                    btnSave.disabled = false;
                                    pStatus.textContent = "";
                                    pStatus.style.color = "green";
                                } else {
                                    pStatus.textContent = validation.reason;
                                    pStatus.style.color = "red";
                                }
                            });
                            pResults.appendChild(item);
                        });
                        // Option to reset to anchor
                        const anchorItem = document.createElement("div");
                        anchorItem.className = "kv-pair";
                        anchorItem.style.padding = "8px";
                        anchorItem.style.cursor = "pointer";
                        anchorItem.innerHTML = `<div class="kv-value"><em>Clear Parent (Set to Root)</em></div>`;
                        anchorItem.addEventListener("click", () => {
                            selectedParent = { guid: null, taxon: "None (Anchor Root)" };
                            pSearch.value = "None (Anchor Root)";
                            pResults.style.display = "none";
                            btnSave.disabled = false;
                            pStatus.textContent = "";
                        });
                        pResults.appendChild(anchorItem);

                        pResults.style.display = "block";
                    } else {
                        pResults.style.display = "none";
                    }
                });

                btnSave.addEventListener("click", async () => {
                    btnSave.disabled = true;
                    pStatus.textContent = "Saving...";
                    try {
                        const res = await fetch('/api/hierarchy', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${AuthService.user.profile.email}`
                            },
                            body: JSON.stringify({
                                record_guid: detail.guid,
                                parent_guid: selectedParent.guid
                            })
                        });
                        if (!res.ok) throw new Error(await res.text());

                        state.hierarchyOverrides[detail.guid] = selectedParent.guid;
                        const label = document.getElementById("currentParentLabel");
                        if (label) label.textContent = selectedParent.taxon;
                        pStatus.textContent = "Saved!";
                    } catch (err) {
                        console.error(err);
                        pStatus.textContent = "Error: " + err.message;
                        btnSave.disabled = false;
                    }
                });
            }, 0);
        }

        rightCol.appendChild(parentSection);
    };
})();

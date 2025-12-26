/**
 * Hierarchy UI Extension
 * Hooks into the new PaneManager cards to add Parent selection.
 */

(function () {
    window.renderRecordCardHook = function (cardEl, detail) {
        // Use sanitized GUID for slot matching
        const slotIdSuffix = detail.guid.replace(/[^a-z0-9]/gi, '_');
        const slot = cardEl.querySelector(`#hierarchy-slot-${slotIdSuffix}`);
        if (!slot) return;

        // --- Taxonomic Parent Section ---
        const parentSection = document.createElement("div");
        parentSection.className = "comments-section"; // Reuse section styling
        parentSection.style.marginTop = "24px";
        parentSection.style.borderTop = "2px solid var(--border)";
        parentSection.style.paddingTop = "16px";

        const parentHeader = document.createElement("div");
        parentHeader.className = "comments-header";
        parentHeader.textContent = "Taxonomic Parent (Editor)";
        parentSection.appendChild(parentHeader);

        const parent = SharedUI.normalizeParentGuid((state.hierarchyOverrides && state.hierarchyOverrides[detail.guid]) || detail.parent_guid);
        let currentParentTaxon = "Fungi (Anchor Root)";
        let isClickable = false;

        if (parent.kind === "record") {
            const p = queryOne(`SELECT taxon FROM ${state.table} WHERE guid = :p`, { ":p": parent.guid });
            if (p) {
                currentParentTaxon = p.taxon;
                isClickable = true;
            }
        } else if (detail.guid !== "F_0000000000_ANCHOR_FUNGI") {
            // Anchor root case
            isClickable = !!detail.parent_guid; // Link to anchor only if explicitly set or we want to allow it
        } else {
            currentParentTaxon = "—";
            isClickable = false;
        }

        const parentDisplay = document.createElement("div");
        parentDisplay.style.marginBottom = "12px";

        let parentHtml = "";
        if (isClickable) {
            parentHtml = `<a href="#" class="parent-link" data-open-guid="${escapeHtml(parent.guid)}" id="currentParentLabel-${slotIdSuffix}">${escapeHtml(currentParentTaxon)}</a>`;
        } else {
            parentHtml = `<span style="color:#888;" id="currentParentLabel-${slotIdSuffix}">${escapeHtml(currentParentTaxon)}</span>`;
        }

        parentDisplay.innerHTML = `<div class="kv"><div class="k">Active Parent:</div><div class="v">${parentHtml}</div></div>`;
        parentSection.appendChild(parentDisplay);

        // Click handler for the parent link
        parentDisplay.addEventListener("click", (e) => {
            const link = e.target.closest(".parent-link");
            if (link) {
                e.preventDefault();
                const guid = link.dataset.openGuid;
                const card = link.closest(".note-card");
                // We need the paneIndex. We can find it by looking at the parent .note-lane children
                const lane = document.getElementById("noteLane");
                const panes = Array.from(lane.children);
                const paneIndex = panes.indexOf(card);
                if (paneIndex !== -1 && state.paneManager) {
                    state.paneManager.open(guid, paneIndex + 1);
                }
            }
        });

        if (AuthService.user && state.userProfile?.can_edit) {
            const parentForm = document.createElement("div");
            parentForm.innerHTML = `
                <div class="filter-item" style="margin-bottom: 8px;">
                    <label style="font-size:12px; font-weight:600; color:#666;">Search New Parent</label>
                    <input type="text" id="parentSearch-${slotIdSuffix}" placeholder="Type taxon name..." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;" />
                </div>
                <div id="parentResults-${slotIdSuffix}" style="max-height: 150px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; display: none; margin-bottom: 8px; background: #fff; position: absolute; z-index: 100; width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
                <button id="btnSaveParent-${slotIdSuffix}" class="comment-submit-btn" disabled>Save Parent</button>
                <div id="parentStatus-${slotIdSuffix}" style="font-size: 12px; margin-top: 4px;"></div>
            `;
            parentSection.appendChild(parentForm);

            const pSearch = parentSection.querySelector(`#parentSearch-${slotIdSuffix}`);
            const pResults = parentSection.querySelector(`#parentResults-${slotIdSuffix}`);
            const btnSave = parentSection.querySelector(`#btnSaveParent-${slotIdSuffix}`);
            const pStatus = parentSection.querySelector(`#parentStatus-${slotIdSuffix}`);
            let selectedParent = null;

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
                            'Authorization': `Bearer ${AuthService.user.email}`
                        },
                        body: JSON.stringify({
                            record_guid: detail.guid,
                            parent_guid: selectedParent.guid
                        })
                    });
                    if (!res.ok) throw new Error(await res.text());

                    state.hierarchyOverrides[detail.guid] = selectedParent.guid;
                    const label = cardEl.querySelector(`#currentParentLabel-${slotIdSuffix}`);
                    if (label) label.textContent = selectedParent.taxon;
                    pStatus.textContent = "Saved! Please refresh to update links.";
                } catch (err) {
                    console.error(err);
                    pStatus.textContent = "Error: " + err.message;
                    btnSave.disabled = false;
                }
            });
        }

        slot.appendChild(parentSection);
    };
})();

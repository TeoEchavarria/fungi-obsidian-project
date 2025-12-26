/* global AuthService, state, queryOne, queryAll */

/**
 * Shared UI Controller
 * Manages Header (Auth), Modals, and Comments across pages.
 */

const SharedUI = (function () {

    // --- Header & Auth UI ---

    function initAuthUI() {
        const btnAuth = document.getElementById("btnAuth");
        const btnLogout = document.getElementById("btnLogout");
        const editorBadge = document.getElementById("editorBadge");

        const authModalBackdrop = document.getElementById("authModalBackdrop");
        const btnAuthClose = document.getElementById("btnAuthClose");
        const tabLogin = document.getElementById("tabLogin");
        const tabRegister = document.getElementById("tabRegister");
        const formLogin = document.getElementById("formLogin");
        const formRegister = document.getElementById("formRegister");

        const btnSubmitLogin = document.getElementById("btnSubmitLogin");
        const btnSubmitRegister = document.getElementById("btnSubmitRegister");
        const authStatus = document.getElementById("authStatus");

        if (!btnAuth) return;

        // Login/Logout Buttons
        btnAuth.addEventListener("click", () => {
            authModalBackdrop.style.display = "flex";
        });

        btnLogout.addEventListener("click", async () => {
            await AuthService.logout();
            window.location.reload();
        });

        if (btnAuthClose) {
            btnAuthClose.addEventListener("click", () => {
                authModalBackdrop.style.display = "none";
            });
        }

        // Tabs
        tabLogin?.addEventListener("click", () => {
            tabLogin.classList.add("active");
            tabRegister.classList.remove("active");
            formLogin.classList.add("active");
            formRegister.classList.remove("active");
        });

        tabRegister?.addEventListener("click", () => {
            tabRegister.classList.add("active");
            tabLogin.classList.remove("active");
            formRegister.classList.add("active");
            formLogin.classList.remove("active");
        });

        // Submit Login
        btnSubmitLogin?.addEventListener("click", async () => {
            authStatus.textContent = "Logging in...";
            try {
                await AuthService.login(document.getElementById("loginEmail").value, document.getElementById("loginPass").value);
                authModalBackdrop.style.display = "none";
                window.location.reload();
            } catch (err) {
                authStatus.textContent = err.message;
            }
        });

        // Submit Register
        btnSubmitRegister?.addEventListener("click", async () => {
            authStatus.textContent = "Registering...";
            try {
                await AuthService.register(
                    document.getElementById("regEmail").value,
                    document.getElementById("regPass").value,
                    document.getElementById("regJustify").value
                );
                authModalBackdrop.style.display = "none";
                window.location.reload();
            } catch (err) {
                authStatus.textContent = err.message;
            }
        });

        // Sync with AuthService state
        AuthService.subscribeToAuth((user) => {
            if (user) {
                btnAuth.style.display = "none";
                btnLogout.style.display = "block";
                btnLogout.textContent = `Logout (${user.email})`;

                // Fetch profile to see if can_edit
                AuthService.getProfile().then(profile => {
                    if (profile && profile.can_edit) {
                        if (editorBadge) editorBadge.style.display = "inline-block";
                        if (state) state.userProfile = profile;
                    }
                });
            } else {
                btnAuth.style.display = "block";
                btnLogout.style.display = "none";
                if (editorBadge) editorBadge.style.display = "none";
            }
        });

        // --- Global Modal Close Listeners ---
        const btnClose = document.getElementById("btnClose");
        const modalBackdrop = document.getElementById("modalBackdrop");

        if (btnClose) btnClose.addEventListener("click", closeModal);
        if (modalBackdrop) {
            modalBackdrop.addEventListener("click", (e) => {
                if (e.target === modalBackdrop) closeModal();
            });
        }

        const authBackdrop = document.getElementById("authModalBackdrop");
        const btnAuthCloseX = document.getElementById("btnAuthClose");
        if (btnAuthCloseX) {
            btnAuthCloseX.addEventListener("click", () => {
                if (authBackdrop) authBackdrop.style.display = "none";
            });
        }
        if (authBackdrop) {
            authBackdrop.addEventListener("click", (e) => {
                if (e.target === authBackdrop) authBackdrop.style.display = "none";
            });
        }
    }

    // --- Modal Logic ---

    function openModal(detail) {
        const modalBackdrop = document.getElementById("modalBackdrop");
        const modalTitle = document.getElementById("modalTitle");
        const modalBody = document.getElementById("modalBody");
        const btnEdit = document.getElementById("btnEditRecord");

        if (!modalBackdrop) return;

        modalTitle.textContent = detail.taxon ? `${detail.taxon}` : `Record ${detail.guid}`;
        modalBody.innerHTML = "";

        const grid = document.createElement("div");
        grid.className = "modal-grid";

        // Left Column
        const leftCol = document.createElement("div");
        leftCol.className = "modal-col-left";
        leftCol.innerHTML = `
            <div class="placeholder-image">No Image</div>
            ${detail.notes ? `<span class="section-title">Notes</span><div class="text-block">${escapeHtml(detail.notes)}</div>` : ''}
            ${detail.citationSource ? `<span class="section-title">Citation Source</span><div class="text-block">${renderCitationSource(detail.citationSource)}</div>` : ''}
        `;

        // Right Column
        const rightCol = document.createElement("div");
        rightCol.className = "modal-col-right";
        const metaFields = ["taxon", "guid", "mbNumber", "taxonomicLevel", "trophicMode", "guild", "growthForm", "confidenceRanking", "trait", "ingested_at"];

        metaFields.forEach(key => {
            const val = detail[key];
            const row = document.createElement("div");
            row.className = "kv-pair";
            row.innerHTML = `
                <div class="kv-label">${key}</div>
                <div class="kv-value">${(val === null || val === undefined || val === "") ? "—" : escapeHtml(String(val))}</div>
            `;
            rightCol.appendChild(row);
        });

        grid.appendChild(leftCol);
        grid.appendChild(rightCol);
        modalBody.appendChild(grid);

        // Edit Button Visibility
        if (AuthService.user && state.userProfile?.can_edit) {
            if (btnEdit) {
                btnEdit.style.display = "block";
                btnEdit.onclick = () => alert(`Editing Record ${detail.guid}`);
            }
        } else if (btnEdit) {
            btnEdit.style.display = "none";
        }

        // Load Comments
        loadComments(detail.guid).then(comments => {
            modalBody.appendChild(renderComments(comments, detail.guid));
        });

        // Hook for app_hierarchy
        if (window.openModalHook) {
            window.openModalHook(detail);
        }

        modalBackdrop.style.display = "flex";
    }

    function closeModal() {
        const modalBackdrop = document.getElementById("modalBackdrop");
        if (modalBackdrop) modalBackdrop.style.display = "none";
    }

    // --- Comments Logic ---

    async function loadComments(recordGuid) {
        try {
            const res = await fetch(`/api/comments?record_guid=${encodeURIComponent(recordGuid)}`);
            if (res.ok) {
                const data = await res.json();
                return data.comments || [];
            }
        } catch (err) {
            console.error(err);
        }
        return [];
    }

    function renderComments(comments, recordGuid) {
        const section = document.createElement("div");
        section.className = "comments-section";
        section.innerHTML = `<div class="comments-header">Comments <span class="comments-count">${comments.length}</span></div>`;

        const list = document.createElement("div");
        list.className = "comments-list";

        if (comments.length === 0) {
            list.innerHTML = `<div class="node-loading">No comments yet.</div>`;
        } else {
            comments.forEach(c => {
                const item = document.createElement("div");
                item.className = "comment-item";
                item.innerHTML = `
                    <div class="comment-meta">
                        <span class="comment-user">${escapeHtml(c.author_email)}</span>
                        <span class="comment-date">${new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="comment-content">${escapeHtml(c.content)}</div>
                `;
                list.appendChild(item);
            });
        }
        section.appendChild(list);

        if (AuthService.user) {
            section.appendChild(renderCommentForm(recordGuid));
        } else {
            const loginPrompt = document.createElement("div");
            loginPrompt.className = "node-loading";
            loginPrompt.innerHTML = `Please <a href="#" id="modalLoginPrompt">login</a> to comment.`;
            section.appendChild(loginPrompt);
            setTimeout(() => {
                document.getElementById("modalLoginPrompt")?.addEventListener("click", (e) => {
                    e.preventDefault();
                    closeModal();
                    document.getElementById("btnAuth").click();
                });
            }, 0);
        }

        return section;
    }

    function renderCommentForm(recordGuid) {
        const form = document.createElement("div");
        form.className = "comment-form";
        form.innerHTML = `
            <div class="comment-form-header">Add a comment</div>
            <textarea id="commentText-${recordGuid}" class="comment-textarea" placeholder="Write your comment..."></textarea>
            <div class="comment-form-actions">
                <div id="commentError-${recordGuid}" style="color:red; font-size:12px;"></div>
                <button id="btnSubmitComment-${recordGuid}" class="comment-submit-btn">Post Comment</button>
            </div>
        `;
        setTimeout(() => {
            const btn = document.getElementById(`btnSubmitComment-${recordGuid}`);
            const text = document.getElementById(`commentText-${recordGuid}`);
            const err = document.getElementById(`commentError-${recordGuid}`);

            btn?.addEventListener("click", async () => {
                const content = text.value.trim();
                if (!content) return;
                btn.disabled = true;
                try {
                    const res = await fetch('/api/comments', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${AuthService.user.email}`
                        },
                        body: JSON.stringify({ record_guid: recordGuid, content })
                    });
                    if (!res.ok) throw new Error(await res.text());
                    // Reload comments section
                    const comments = await loadComments(recordGuid);
                    const newSection = renderComments(comments, recordGuid);
                    form.parentElement.replaceWith(newSection);
                } catch (e) {
                    err.textContent = e.message;
                    btn.disabled = false;
                }
            });
        }, 0);
        return form;
    }

    // --- Helpers ---

    function escapeHtml(s) {
        return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function renderCitationSource(text) {
        if (!text) return "—";

        // Regex to find potential URLs starting with http:// or https://
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        // Split text by URL patterns
        const parts = text.split(urlRegex);

        return parts.map((part, index) => {
            if (index % 2 === 0) {
                return escapeHtml(part);
            }

            let url = part;
            let trailing = "";

            while (true) {
                const lastChar = url.slice(-1);
                if ([".", ",", ";", "!", "?"].includes(lastChar)) {
                    trailing = lastChar + trailing;
                    url = url.slice(0, -1);
                    continue;
                }
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
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
        }).join("");
    }

    function normalizeParentGuid(parentGuid) {
        if (!parentGuid) return { kind: "anchor", guid: "F_0000000000_ANCHOR_FUNGI" };
        const s = String(parentGuid).trim();
        if (s === "" || s.toUpperCase() === "NULL") return { kind: "anchor", guid: "F_0000000000_ANCHOR_FUNGI" };
        return { kind: "record", guid: s };
    }

    function loadDetail(guid, state) {
        if (!state.paneManager) {
            const laneEl = document.getElementById("noteLane");
            state.paneManager = new PaneManager({
                laneEl,
                fetchRecord: (guid) => queryOne(`SELECT * FROM funguild WHERE guid = :guid LIMIT 1`, { ":guid": guid }),
                renderRecordCard: null,
            });
            state.paneManager.renderRecordCard = renderRecordCardFactory(state);
        }

        const modalBackdrop = document.getElementById("modalBackdrop");
        if (modalBackdrop.style.display !== "flex") {
            modalBackdrop.style.display = "flex";
            const modal = modalBackdrop.querySelector(".modal");
            if (modal) {
                modal.style.width = "95vw";
                modal.style.maxWidth = "none";
            }
        }

        state.paneManager.open(guid, 0);
    }

    function renderRecordCardFactory(state) {
        return function renderRecordCard(rec, paneIndex) {
            const el = document.createElement("article");
            el.className = "note-card";

            el.innerHTML = `
      <div class="note-card__body">
        <h2 class="record-title">${escapeHtml(rec.taxon || rec.guid)}</h2>
        <div class="record-subtitle">
            Level: ${escapeHtml(rec.taxonomicLevel ?? "—")} &bull; GUID: ${escapeHtml(rec.guid)}
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap: 24px; margin-top: 16px;">
          <!-- LEFT column -->
          <section>
            <div style="border:1px solid var(--border); border-radius:12px; height: 180px; display:flex; align-items:center; justify-content:center; color:#999; background:#f9f9f9; font-size:13px; margin-bottom:16px;">
              Image Placeholder
            </div>

            <div class="kv">
              <div class="k">Notes</div>
              <div class="v" style="font-size:14px; line-height:1.5;">${escapeHtml(rec.notes ?? "—")}</div>
            </div>

            <div class="kv" style="margin-top:12px;">
                <div class="k">Citations</div>
                <div class="v" data-slot="citations" style="font-size:13px; color:#555;"></div>
            </div>
          </section>

          <!-- RIGHT column -->
          <section>
            <div class="meta-section" style="background:rgba(0,0,0,0.02); border-radius:8px; padding:12px;">
                ${renderMetaKV(rec)}
            </div>
            <div id="hierarchy-slot-${rec.guid.replace(/[^a-z0-9]/gi, '_')}"></div>
            <div id="comments-slot-${rec.guid.replace(/[^a-z0-9]/gi, '_')}"></div>
          </section>
        </div>
      </div>
    `;

            const citeSlot = el.querySelector('[data-slot="citations"]');
            if (citeSlot) {
                citeSlot.innerHTML = renderCitationSource(rec.citationSource);
            }

            loadComments(rec.guid).then(comments => {
                const slot = el.querySelector(`#comments-slot-${rec.guid.replace(/[^a-z0-9]/gi, '_')}`);
                if (slot) {
                    slot.appendChild(renderComments(comments, rec.guid));
                }
            });

            if (window.renderRecordCardHook) {
                window.renderRecordCardHook(el, rec);
            }

            el.addEventListener("click", (e) => {
                const t = e.target;
                if (t && t.dataset && t.dataset.openGuid) {
                    state.paneManager.open(t.dataset.openGuid, paneIndex + 1);
                    return;
                }
                if (t && t.dataset && t.dataset.action === "close-pane") {
                    state.paneManager.openStack = state.paneManager.openStack.slice(0, paneIndex);
                    state.paneManager._renderPlaceholders();
                    // If closing the first pane, close modal
                    if (paneIndex === 0) closeModal();
                }
            });

            return el;
        };
    }

    function renderMetaKV(rec) {
        const skip = new Set(["notes", "citationSource", "raw_json", "ingested_at", "guid", "taxon", "taxonomicLevel", "parent_guid"]);
        const keys = Object.keys(rec).filter(k => !skip.has(k)).sort();
        return keys.map(k => `
    <div class="kv" style="margin-bottom:6px;">
      <div class="k" style="font-size:11px; opacity:0.7;">${escapeHtml(k)}</div>
      <div class="v" style="font-size:13px;">${escapeHtml(rec[k] ?? "—")}</div>
    </div>
  `).join("");
    }

    return {
        initAuthUI,
        openModal,
        closeModal,
        escapeHtml,
        renderCitationSource,
        loadDetail,
        loadComments,
        renderComments,
        normalizeParentGuid
    };
})();

// Automatic Init
document.addEventListener("DOMContentLoaded", () => {
    SharedUI.initAuthUI();
});

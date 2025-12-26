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

    function renderCitationSource(source) {
        if (!source) return "";
        // Basic linkification
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return source.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
    }

    return {
        initAuthUI,
        openModal,
        closeModal,
        escapeHtml
    };
})();

// Automatic Init
document.addEventListener("DOMContentLoaded", () => {
    SharedUI.initAuthUI();
});

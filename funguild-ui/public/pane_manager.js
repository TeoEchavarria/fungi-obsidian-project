class PaneManager {
    constructor({ laneEl, fetchRecord, renderRecordCard }) {
        this.laneEl = laneEl;
        this.fetchRecord = fetchRecord;           // async (guid) => record
        this.renderRecordCard = renderRecordCard; // (record, paneIndex) => HTMLElement
        this.cache = new Map();                   // guid -> record
        this.openStack = [];                      // array of guids in order
    }

    async open(guid, paneIndex = 0) {
        if (!guid) return;

        // If opening at index, remove everything to the right.
        this.openStack = this.openStack.slice(0, paneIndex);
        this.openStack[paneIndex] = guid;

        // Render immediately placeholder to avoid "empty gap"
        this._renderPlaceholders();

        // Fetch record (cached)
        let rec = this.cache.get(guid);
        if (!rec) {
            rec = await this.fetchRecord(guid);
            if (!rec) {
                this._renderError(guid, paneIndex);
                return;
            }
            this.cache.set(guid, rec);
        }

        // Replace pane DOM
        this._setPaneEl(paneIndex, this.renderRecordCard(rec, paneIndex));

        // Auto-scroll lane to the newly opened pane
        this._scrollToPane(paneIndex);
    }

    _renderPlaceholders() {
        // Ensure lane has N panes
        while (this.laneEl.children.length < this.openStack.length) {
            const sk = document.createElement("div");
            sk.className = "note-card";
            sk.innerHTML = `<div class="note-card__hdr"><div class="note-card__title">Loading…</div></div>`;
            this.laneEl.appendChild(sk);
        }
        // Remove extra panes in DOM if stack shrank
        while (this.laneEl.children.length > this.openStack.length) {
            this.laneEl.removeChild(this.laneEl.lastElementChild);
        }
    }

    _setPaneEl(index, el) {
        const old = this.laneEl.children[index];
        if (old) {
            this.laneEl.replaceChild(el, old);
        } else {
            this.laneEl.appendChild(el);
        }
    }

    _renderError(guid, index) {
        const el = document.createElement("article");
        el.className = "note-card";
        el.innerHTML = `
      <div class="note-card__hdr">
        <div class="note-card__title">Not found</div>
        <div class="note-card__meta">guid: ${this._escapeHtml(guid)}</div>
      </div>
      <div class="note-card__body">
        <p>Record not found in SQLite.</p>
      </div>`;
        this._setPaneEl(index, el);
    }

    _scrollToPane(index) {
        const pane = this.laneEl.children[index];
        if (!pane) return;
        pane.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }

    _escapeHtml(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
}

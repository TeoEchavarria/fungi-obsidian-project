class CardCanvasManager {
    constructor({ canvasEl, fetchRecord, renderRecordCard }) {
        this.canvasEl = canvasEl;
        this.fetchRecord = fetchRecord;           // async (guid) => record
        this.renderRecordCard = renderRecordCard; // (record) => HTMLElement
        this.cache = new Map();                   // guid -> record
        this.openCards = new Map();               // guid -> { el, record }
        this.openOrder = [];                      // array of guids in order
    }

    async openCard(guid) {
        if (!guid) return;

        // 1. Check if already open
        if (this.openCards.has(guid)) {
            this.focusCard(guid);
            return;
        }

        // 2. Fetch record (cached)
        let rec = this.cache.get(guid);
        if (!rec) {
            rec = await this.fetchRecord(guid);
            if (!rec) {
                this._renderError(guid);
                return;
            }
            this.cache.set(guid, rec);
        }

        // 3. Render
        const cardEl = this.renderRecordCard(rec);
        cardEl.classList.add('card--enter');

        // 4. Append to canvas
        this.canvasEl.appendChild(cardEl);
        this.openCards.set(guid, { el: cardEl, record: rec });
        this.openOrder.push(guid);

        // 5. Scroll to new card
        this._scrollToCard(cardEl);
    }

    closeCard(guid) {
        const cardData = this.openCards.get(guid);
        if (cardData) {
            cardData.el.remove();
            this.openCards.delete(guid);
            this.openOrder = this.openOrder.filter(g => g !== guid);
        }

        // Auto-close modal if no cards left
        if (this.openCards.size === 0 && window.SharedUI) {
            window.SharedUI.closeModal();
        }
    }

    focusCard(guid) {
        const cardData = this.openCards.get(guid);
        if (cardData) {
            this._scrollToCard(cardData.el);
            cardData.el.classList.add('card--pulse');
            setTimeout(() => cardData.el.classList.remove('card--pulse'), 1000);
        }
    }

    _scrollToCard(el) {
        el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    _renderError(guid) {
        const el = document.createElement("article");
        el.className = "card card--enter";
        el.innerHTML = `
      <header class="card-header">
        <div>
          <h2 class="card-title">Not found</h2>
          <div class="card-subtitle">guid: ${this._escapeHtml(guid)}</div>
        </div>
        <button class="card-close" data-action="close-card" data-guid="${this._escapeHtml(guid)}">×</button>
      </header>
      <div class="card-body">
        <p>Record not found in SQLite.</p>
      </div>`;
        this.canvasEl.appendChild(el);
        this._scrollToCard(el);

        // Listen for close on error card too
        el.querySelector('[data-action="close-card"]').onclick = () => el.remove();
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

// Support legacy naming during transition if needed, but we'll update scripts
window.CardCanvasManager = CardCanvasManager;

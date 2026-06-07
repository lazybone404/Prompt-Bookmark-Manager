/**
 * 搜索栏组件 — debounce 200ms，触发 search-input 事件
 *
 * 用法：
 *   <search-bar placeholder="搜索..."></search-bar>
 *   searchBar.addEventListener('search-input', (e) => { query = e.detail.value; });
 */

class SearchBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._debounceTimer = null;
    this.render();
  }

  static get observedAttributes() {
    return ['placeholder', 'focused'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'placeholder') {
      const input = this.shadowRoot?.querySelector('input');
      if (input) input.placeholder = newVal || '';
    }
    if (name === 'focused' && newVal !== null) {
      const input = this.shadowRoot?.querySelector('input');
      if (input) setTimeout(() => input.focus(), 50);
    }
  }

  render() {
    const placeholder = this.getAttribute('placeholder') || '搜索...';
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
        }

        .search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        input {
          width: 100%;
          padding: 8px 12px 8px 32px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-secondary, #f9fafb);
          font-family: var(--font-family, sans-serif);
          font-size: 13px;
          color: var(--text-primary, #111827);
          outline: none;
          transition: border-color var(--transition-fast, 150ms), background var(--transition-fast, 150ms);
        }

        input:focus {
          border-color: var(--color-primary, #4f46e5);
          background: var(--bg-primary, #ffffff);
        }

        input::placeholder {
          color: var(--text-tertiary, #9ca3af);
        }

        .search-icon {
          position: absolute;
          left: 10px;
          font-size: 14px;
          pointer-events: none;
          opacity: 0.4;
        }

        .clear-btn {
          position: absolute;
          right: 8px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          color: var(--text-tertiary, #9ca3af);
          display: none;
          padding: 2px 4px;
          border-radius: 50%;
        }

        .clear-btn:hover {
          background: var(--bg-tertiary, #f3f4f6);
          color: var(--text-secondary, #6b7280);
        }

        .clear-btn.visible {
          display: block;
        }
      </style>
      <div class="search-wrapper">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="${placeholder}" autocomplete="off">
        <button class="clear-btn" title="清除">✕</button>
      </div>
    `;

    const input = this.shadowRoot.querySelector('input');
    const clearBtn = this.shadowRoot.querySelector('.clear-btn');

    input.addEventListener('input', () => {
      clearBtn.classList.toggle('visible', input.value.length > 0);
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.dispatchEvent(new CustomEvent('search-input', {
          detail: { value: input.value },
          bubbles: true,
          composed: true,
        }));
      }, 200);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        clearBtn.classList.remove('visible');
        this.dispatchEvent(new CustomEvent('search-input', {
          detail: { value: '' },
          bubbles: true,
          composed: true,
        }));
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      input.focus();
      this.dispatchEvent(new CustomEvent('search-input', {
        detail: { value: '' },
        bubbles: true,
        composed: true,
      }));
    });
  }

  get value() {
    return this.shadowRoot?.querySelector('input')?.value || '';
  }

  set value(val) {
    const input = this.shadowRoot?.querySelector('input');
    if (input) input.value = val;
  }
}

customElements.define('search-bar', SearchBar);

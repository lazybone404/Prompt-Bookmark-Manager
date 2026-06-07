/**
 * 导出对话框 — 选择导出范围和格式
 *
 * 用法：
 *   <export-dialog prompts='[...]' categories='[...]'></export-dialog>
 */

import { exportSinglePrompt, exportBatch } from '../lib/export.js';
import { escapeHtml } from '../lib/utils.js';

class ExportDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._prompts = [];
    this._categories = {};
    this._mode = 'all';
    this.render();
  }

  static get observedAttributes() {
    return ['prompts', 'categories'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'prompts') {
      try { this._prompts = JSON.parse(newVal || '[]'); } catch (e) { /* ignore */ }
    }
    if (name === 'categories') {
      try {
        const arr = JSON.parse(newVal || '[]');
        this._categories = {};
        arr.forEach(c => { this._categories[c.id] = c; });
      } catch (e) { /* ignore */ }
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1500;
          align-items: center;
          justify-content: center;
        }

        :host(.visible) {
          display: flex;
        }

        .dialog {
          background: var(--bg-primary, #ffffff);
          border-radius: var(--radius-lg, 12px);
          width: 90%;
          max-width: 480px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
        }

        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-lg, 16px);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .dialog-title { font-size: 16px; font-weight: 600; }

        .close-btn {
          border: none;
          background: none;
          cursor: pointer;
          font-size: 18px;
          color: var(--text-tertiary, #9ca3af);
        }

        .dialog-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-lg, 16px);
        }

        .export-option {
          display: flex;
          align-items: center;
          padding: var(--space-md, 12px);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          margin-bottom: var(--space-sm, 8px);
          cursor: pointer;
          transition: all var(--transition-fast, 150ms);
        }

        .export-option:hover {
          border-color: var(--color-primary, #4f46e5);
          background: var(--bg-hover, #f0f0ff);
        }

        .export-option.selected {
          border-color: var(--color-primary, #4f46e5);
          background: var(--color-primary-light, #e0e7ff);
        }

        .option-radio {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid var(--border-color, #e5e7eb);
          margin-right: var(--space-md, 12px);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .export-option.selected .option-radio {
          border-color: var(--color-primary, #4f46e5);
        }

        .export-option.selected .option-radio::after {
          content: '';
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--color-primary, #4f46e5);
        }

        .option-info {
          flex: 1;
        }

        .option-label {
          font-size: 14px;
          font-weight: 500;
        }

        .option-desc {
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
          margin-top: 2px;
        }

        .prompt-list {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          margin-top: var(--space-sm, 8px);
        }

        .prompt-list-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          font-size: 13px;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          cursor: pointer;
        }

        .prompt-list-item:last-child {
          border-bottom: none;
        }

        .prompt-list-item input[type="checkbox"] {
          margin-right: 8px;
        }

        .dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-sm, 8px);
          padding: var(--space-md, 12px) var(--space-lg, 16px);
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .btn {
          padding: 8px 20px;
          border-radius: var(--radius-md, 8px);
          font-family: var(--font-family, sans-serif);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition-fast, 150ms);
        }

        .btn-cancel {
          border: 1px solid var(--border-color, #e5e7eb);
          background: var(--bg-primary, #ffffff);
          color: var(--text-secondary, #6b7280);
        }

        .btn-primary {
          border: none;
          background: var(--color-primary, #4f46e5);
          color: var(--text-inverse, #ffffff);
        }

        .btn-primary:hover {
          background: var(--color-primary-hover, #4338ca);
        }
      </style>
      <div class="dialog">
        <div class="dialog-header">
          <span class="dialog-title">📤 导出 Prompt</span>
          <button class="close-btn" id="close-btn">✕</button>
        </div>
        <div class="dialog-body">
          <div class="export-option selected" data-mode="all">
            <div class="option-radio"></div>
            <div class="option-info">
              <div class="option-label">📦 导出全部</div>
              <div class="option-desc">导出所有 Prompt，保留分类目录结构（ZIP）</div>
            </div>
          </div>
          <div class="export-option" data-mode="favorites">
            <div class="option-radio"></div>
            <div class="option-info">
              <div class="option-label">⭐ 导出收藏</div>
              <div class="option-desc">仅导出已收藏的 Prompt（ZIP）</div>
            </div>
          </div>
          <div class="export-option" data-mode="manual">
            <div class="option-radio"></div>
            <div class="option-info">
              <div class="option-label">✅ 手动选择</div>
              <div class="option-desc">勾选需要导出的 Prompt（ZIP）</div>
            </div>
          </div>
          <div class="prompt-list hidden" id="prompt-list"></div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-cancel" id="cancel-btn">取消</button>
          <button class="btn btn-primary" id="export-btn">📤 导出</button>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => this._close());
    this.shadowRoot.getElementById('cancel-btn').addEventListener('click', () => this._close());

    // 选择导出模式
    this.shadowRoot.querySelectorAll('.export-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('.export-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._mode = opt.dataset.mode;

        const list = this.shadowRoot.getElementById('prompt-list');
        if (this._mode === 'manual') {
          list.classList.remove('hidden');
          this._renderPromptList();
        } else {
          list.classList.add('hidden');
        }
      });
    });

    // 导出按钮
    this.shadowRoot.getElementById('export-btn').addEventListener('click', async () => {
      let toExport = [];

      switch (this._mode) {
        case 'all':
          toExport = this._prompts;
          break;
        case 'favorites':
          toExport = this._prompts.filter(p => p.favorite);
          break;
        case 'manual':
          const checks = this.shadowRoot.querySelectorAll('.prompt-list-item input:checked');
          const ids = Array.from(checks).map(c => c.dataset.id);
          toExport = this._prompts.filter(p => ids.includes(p.id));
          break;
      }

      if (toExport.length === 0) {
        this.dispatchEvent(new CustomEvent('toast', {
          detail: { message: '没有可导出的 Prompt', type: 'warning' },
          bubbles: true,
          composed: true,
        }));
        return;
      }

      await exportBatch(toExport, this._categories, this._mode);
      this._close();
    });

    this.addEventListener('click', (e) => {
      if (e.target === this) this._close();
    });
  }

  _renderPromptList() {
    const list = this.shadowRoot.getElementById('prompt-list');
    if (!list) return;

    list.innerHTML = this._prompts.map(p => `
      <div class="prompt-list-item">
        <input type="checkbox" data-id="${p.id}" checked>
        <span>${escapeHtml(p.title || '未命名')}</span>
      </div>
    `).join('');
  }

  _close() {
    this.classList.remove('visible');
  }

  connectedCallback() {
    this.classList.add('visible');
  }
}

customElements.define('export-dialog', ExportDialog);

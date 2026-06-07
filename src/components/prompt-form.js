/**
 * Prompt 编辑表单 — 新建/编辑/预览
 *
 * 用法：
 *   <prompt-editor mode="edit|create|preview" prompt-data='{...}' categories='[...]'></prompt-editor>
 *   editor.addEventListener('save', (e) => { ... e.detail });
 *   editor.addEventListener('copy', () => { ... });
 *   editor.addEventListener('close', () => { ... });
 */

import { store } from '../lib/store.js';
import { saveDraft, removeDraft } from '../lib/draft.js';
import { buildCategoryTree } from '../lib/utils.js';

class PromptEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._mode = 'edit'; // edit | create | preview
    this._data = {};
    this._categories = [];
    this._draftTimer = null;
    this.render();
  }

  static get observedAttributes() {
    return ['mode', 'prompt-data', 'categories'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'mode') {
      this._mode = newVal || 'edit';
      this._updateMode();
    }
    if (name === 'prompt-data') {
      try {
        this._data = JSON.parse(newVal || '{}');
        this._fillForm();
      } catch (e) { /* ignore */ }
    }
    if (name === 'categories') {
      try {
        this._categories = JSON.parse(newVal || '[]');
        this._fillCategories();
      } catch (e) { /* ignore */ }
    }
  }

  render() {
    const isCreate = this._mode === 'create';
    const title = isCreate ? '新建 Prompt' : (this._mode === 'preview' ? '预览 Prompt' : '编辑 Prompt');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        :host(.hidden) {
          display: none;
        }

        .editor-panel {
          background: var(--bg-primary, #ffffff);
          border-radius: var(--radius-lg, 12px);
          width: 90%;
          max-width: 500px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
        }

        .editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-lg, 16px);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .editor-title {
          font-size: 16px;
          font-weight: 600;
        }

        .close-btn {
          border: none;
          background: none;
          cursor: pointer;
          font-size: 18px;
          color: var(--text-tertiary, #9ca3af);
          padding: 4px 8px;
          border-radius: var(--radius-sm, 4px);
        }

        .close-btn:hover {
          background: var(--bg-tertiary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .editor-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-lg, 16px);
          display: flex;
          flex-direction: column;
          gap: var(--space-md, 12px);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .form-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary, #6b7280);
        }

        .form-input, .form-textarea, .form-select {
          padding: 8px 12px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          font-family: var(--font-family, sans-serif);
          font-size: 14px;
          color: var(--text-primary, #111827);
          outline: none;
          transition: border-color var(--transition-fast, 150ms);
        }

        .form-input:focus, .form-textarea:focus, .form-select:focus {
          border-color: var(--color-primary, #4f46e5);
        }

        .form-textarea {
          min-height: 120px;
          resize: vertical;
          line-height: 1.5;
        }

        .editor-footer {
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

        .btn-primary {
          border: none;
          background: var(--color-primary, #4f46e5);
          color: var(--text-inverse, #ffffff);
        }

        .btn-primary:hover {
          background: var(--color-primary-hover, #4338ca);
        }

        .btn-secondary {
          border: 1px solid var(--border-color, #e5e7eb);
          background: var(--bg-primary, #ffffff);
          color: var(--text-secondary, #6b7280);
        }

        .btn-secondary:hover {
          background: var(--bg-tertiary, #f3f4f6);
        }

        .btn-copy {
          border: none;
          background: #10b981;
          color: #ffffff;
        }

        .btn-copy:hover {
          background: #059669;
        }

        /* 预览模式 */
        .preview-content {
          white-space: pre-wrap;
          font-size: 14px;
          line-height: 1.6;
          padding: var(--space-md, 12px);
          background: var(--bg-secondary, #f9fafb);
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border-color, #e5e7eb);
          max-height: 300px;
          overflow-y: auto;
        }

        .readonly {
          background: var(--bg-secondary, #f9fafb);
          cursor: default;
        }
      </style>
      <div class="editor-panel">
        <div class="editor-header">
          <span class="editor-title">${title}</span>
          <button class="close-btn" id="close-btn">✕</button>
        </div>
        <div class="editor-body">
          <div class="form-group">
            <label class="form-label">标题</label>
            <input class="form-input" id="title-input" placeholder="Prompt 标题" ${this._mode === 'preview' ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label">分类</label>
            <select class="form-select" id="category-select" ${this._mode === 'preview' ? 'disabled' : ''}>
              <option value="">未分类</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">描述（可选）</label>
            <input class="form-input" id="desc-input" placeholder="简短描述这个 Prompt 的用途" ${this._mode === 'preview' ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label">内容</label>
            ${this._mode === 'preview'
              ? '<div class="preview-content" id="content-preview"></div>'
              : '<textarea class="form-textarea" id="content-textarea" placeholder="输入 Prompt 内容..."></textarea>'
            }
          </div>
        </div>
        <div class="editor-footer">
          ${this._mode === 'preview' ? `
            <button class="btn btn-secondary" id="edit-from-preview-btn">✏️ 编辑</button>
            <button class="btn btn-copy" id="copy-from-preview-btn">📋 复制</button>
          ` : `
            <button class="btn btn-secondary" id="cancel-btn">取消</button>
            <button class="btn btn-primary" id="save-btn">💾 保存</button>
          `}
        </div>
      </div>
    `;

    this._bindEvents();
    this._fillForm();
    this._fillCategories();
    this._updateMode();
  }

  _bindEvents() {
    // 关闭
    this.shadowRoot.getElementById('close-btn')?.addEventListener('click', () => {
      this._close();
    });
    this.shadowRoot.getElementById('cancel-btn')?.addEventListener('click', () => {
      this._close();
    });

    // 保存
    this.shadowRoot.getElementById('save-btn')?.addEventListener('click', () => {
      this._save();
    });

    // 预览模式 - 复制
    this.shadowRoot.getElementById('copy-from-preview-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy', { bubbles: true, composed: true }));
    });

    // 预览模式 - 切换到编辑
    this.shadowRoot.getElementById('edit-from-preview-btn')?.addEventListener('click', () => {
      this._mode = 'edit';
      this.render();
    });

    // 自动保存草稿（仅编辑模式）
    if (this._mode !== 'preview') {
      ['title-input', 'content-textarea', 'desc-input'].forEach(id => {
        this.shadowRoot.getElementById(id)?.addEventListener('input', () => {
          this._autoSaveDraft();
        });
      });
      this.shadowRoot.getElementById('category-select')?.addEventListener('change', () => {
        this._autoSaveDraft();
      });
    }

    // 点击遮罩关闭
    this.addEventListener('click', (e) => {
      if (e.target === this) this._close();
    });

    // ESC 关闭
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this._close();
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _fillForm() {
    const setVal = (id, val) => {
      const el = this.shadowRoot?.getElementById(id);
      if (el) el.value = val || '';
    };
    setVal('title-input', this._data.title || '');
    setVal('desc-input', this._data.description || '');
    setVal('content-textarea', this._data.content || '');
    const preview = this.shadowRoot?.getElementById('content-preview');
    if (preview) preview.textContent = this._data.content || '';
  }

  _fillCategories() {
    const select = this.shadowRoot?.getElementById('category-select');
    if (!select) return;
    select.innerHTML = '<option value="">未分类</option>';

    const tree = buildCategoryTree(this._categories);
    const addOptions = (nodes, depth) => {
      for (const cat of nodes) {
        const prefix = depth > 0 ? '　'.repeat(depth) + '└ ' : '';
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = prefix + cat.name;
        select.appendChild(option);
        if (cat.children?.length) addOptions(cat.children, depth + 1);
      }
    };
    addOptions(tree, 0);

    if (this._data.categoryId) {
      select.value = this._data.categoryId;
    }
  }

  _updateMode() {
    // 通过 class 控制 visible
    if (this._mode === 'preview') {
      const titleEl = this.shadowRoot?.querySelector('.editor-title');
      if (titleEl) titleEl.textContent = '预览 Prompt';
    }
  }

  _getFormData() {
    return {
      id: this._data.id || undefined,
      title: this.shadowRoot?.getElementById('title-input')?.value || '',
      content: this.shadowRoot?.getElementById('content-textarea')?.value || '',
      description: this.shadowRoot?.getElementById('desc-input')?.value || '',
      categoryId: this.shadowRoot?.getElementById('category-select')?.value || null,
      favorite: this._data.favorite ?? false,
      useCount: this._data.useCount ?? 0,
      lastUsedAt: this._data.lastUsedAt || '',
      createdAt: this._data.createdAt || undefined,
    };
  }

  async _save() {
    const data = this._getFormData();
    if (!data.title.trim()) {
      this.dispatchEvent(new CustomEvent('toast', {
        detail: { message: '请输入标题', type: 'warning' },
        bubbles: true,
        composed: true,
      }));
      return;
    }
    // 清除草稿
    if (this._data.id) {
      await removeDraft(this._data.id);
    }
    this.dispatchEvent(new CustomEvent('save', {
      detail: data,
      bubbles: true,
      composed: true,
    }));
  }

  _autoSaveDraft() {
    clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(async () => {
      const data = this._getFormData();
      const draftId = this._data.id || '_new';
      if (data.title.trim() || data.content.trim()) {
        await saveDraft(draftId, data);
      }
    }, 500);
  }

  _close() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  disconnectedCallback() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
  }
}

customElements.define('prompt-editor', PromptEditor);

/**
 * 导入对话框 — 拖拽/选择文件 + 预览 + 确认导入
 *
 * 用法：
 *   <import-dialog></import-dialog>
 *   dialog.addEventListener('import-complete', () => { ... });
 */

import { parseFiles, parseFolderEntry, parseZipFile, previewImport, executeImport } from '../lib/import.js';
import { store } from '../lib/store.js';
import { escapeHtml } from '../lib/utils.js';

class ImportDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._parsedFiles = [];
    this._preview = null;
    this._step = 'upload'; // upload | preview | importing
    this.render();
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
          max-width: 520px;
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

        .dialog-title {
          font-size: 16px;
          font-weight: 600;
        }

        .close-btn {
          border: none;
          background: none;
          cursor: pointer;
          font-size: 18px;
          color: var(--text-tertiary, #9ca3af);
        }

        .close-btn:hover {
          color: var(--text-primary, #111827);
        }

        .dialog-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-lg, 16px);
        }

        /* 上传区域 */
        .drop-zone {
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
          padding: var(--space-xl, 24px);
          text-align: center;
          cursor: pointer;
          transition: all var(--transition-fast, 150ms);
        }

        .drop-zone:hover, .drop-zone.dragover {
          border-color: var(--color-primary, #4f46e5);
          background: var(--color-primary-light, #e0e7ff);
        }

        .drop-zone-icon {
          font-size: 48px;
          margin-bottom: var(--space-md, 12px);
        }

        .drop-zone-text {
          font-size: 14px;
          color: var(--text-secondary, #6b7280);
        }

        .drop-zone-hint {
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
          margin-top: var(--space-sm, 8px);
        }

        .file-input {
          display: none;
        }

        /* 预览 */
        .preview-section {
          margin-top: var(--space-md, 12px);
        }

        .preview-summary {
          display: flex;
          gap: var(--space-md, 12px);
          margin-bottom: var(--space-md, 12px);
        }

        .summary-card {
          flex: 1;
          padding: var(--space-md, 12px);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-secondary, #f9fafb);
          text-align: center;
        }

        .summary-card.warn {
          background: #fef3c7;
        }

        .summary-number {
          font-size: 24px;
          font-weight: 700;
          color: var(--color-primary, #4f46e5);
        }

        .summary-card.warn .summary-number {
          color: var(--color-warning, #f59e0b);
        }

        .summary-label {
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          margin-top: 4px;
        }

        .preview-list {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-md, 8px);
        }

        .preview-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          font-size: 13px;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .preview-item:last-child {
          border-bottom: none;
        }

        .preview-item.new {
          color: var(--color-success, #10b981);
        }

        .preview-item.duplicate {
          color: var(--text-tertiary, #9ca3af);
          text-decoration: line-through;
        }

        .preview-item.conflict {
          color: var(--color-warning, #f59e0b);
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

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      </style>
      <div class="dialog">
        <div class="dialog-header">
          <span class="dialog-title">📥 导入 Prompt</span>
          <button class="close-btn" id="close-btn">✕</button>
        </div>
        <div class="dialog-body" id="dialog-body">
          <div id="upload-section">
            <div class="drop-zone" id="drop-zone">
              <div class="drop-zone-icon">📂</div>
              <div class="drop-zone-text">拖拽文件/文件夹到此处</div>
              <div class="drop-zone-hint">支持 .txt、.md、.zip 格式</div>
            </div>
            <input type="file" class="file-input" id="file-input" accept=".txt,.md,.zip" multiple>
            <input type="file" class="file-input" id="folder-input" webkitdirectory multiple>
          </div>
          <div id="preview-section" class="preview-section hidden"></div>
          <div id="importing-section" class="hidden" style="text-align:center;padding:40px;">
            <div style="font-size:32px;margin-bottom:12px;">⏳</div>
            <div>正在导入...</div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-cancel" id="cancel-btn">取消</button>
          <button class="btn btn-primary" id="import-btn" disabled>确认导入</button>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => this._close());
    this.shadowRoot.getElementById('cancel-btn').addEventListener('click', () => this._close());

    // 拖拽
    const dropZone = this.shadowRoot.getElementById('drop-zone');
    dropZone.addEventListener('click', () => {
      this.shadowRoot.getElementById('file-input').click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');

      const items = e.dataTransfer.items;
      if (!items) return;

      const allResults = [];

      for (const item of items) {
        if (item.kind === 'file') {
          // 检查是否为文件夹
          const entry = item.webkitGetAsEntry?.();
          if (entry && entry.isDirectory) {
            const folderResults = await parseFolderEntry(item);
            allResults.push(...folderResults);
          } else {
            const file = item.getAsFile();
            if (file.name.endsWith('.zip')) {
              const zipResults = await parseZipFile(file);
              allResults.push(...zipResults);
            } else {
              const fileResults = await parseFiles([file]);
              allResults.push(...fileResults);
            }
          }
        }
      }

      if (allResults.length > 0) {
        this._showPreview(allResults);
      }
    });

    // 文件选择
    this.shadowRoot.getElementById('file-input').addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const allResults = [];
      for (const file of files) {
        if (file.name.endsWith('.zip')) {
          const zipResults = await parseZipFile(file);
          allResults.push(...zipResults);
        } else {
          const fileResults = await parseFiles([file]);
          allResults.push(...fileResults);
        }
      }

      if (allResults.length > 0) {
        this._showPreview(allResults);
      }
    });

    // 导入确认
    this.shadowRoot.getElementById('import-btn').addEventListener('click', async () => {
      if (!this._parsedFiles || this._parsedFiles.length === 0) return;

      this._setStep('importing');
      const existingCategories = await store.getCategories();
      const toImport = previewImport(this._parsedFiles, existingCategories);
      const result = await executeImport(toImport);

      this.dispatchEvent(new CustomEvent('import-complete', {
        detail: result,
        bubbles: true,
        composed: true,
      }));
      this._close();
    });

    // 点击遮罩关闭
    this.addEventListener('click', (e) => {
      if (e.target === this) this._close();
    });
  }

  async _showPreview(parsedFiles) {
    this._parsedFiles = parsedFiles;
    this._step = 'preview';

    const existingCategories = await store.getCategories();
    const existingPrompts = await store.getPrompts();
    this._preview = previewImport(parsedFiles, existingCategories, existingPrompts);

    const previewSection = this.shadowRoot.getElementById('preview-section');
    const uploadSection = this.shadowRoot.getElementById('upload-section');
    const importBtn = this.shadowRoot.getElementById('import-btn');

    uploadSection.classList.add('hidden');
    previewSection.classList.remove('hidden');

    const newCount = this._preview.prompts.length - this._preview.duplicates.length;
    const dupCount = this._preview.duplicates.length;
    const conflictCount = this._preview.conflicts.length;

    previewSection.innerHTML = `
      <div class="preview-summary">
        <div class="summary-card">
          <div class="summary-number">${newCount}</div>
          <div class="summary-label">将导入</div>
        </div>
        ${dupCount > 0 ? `
        <div class="summary-card warn">
          <div class="summary-number">${dupCount}</div>
          <div class="summary-label">将跳过（重复）</div>
        </div>` : ''}
        ${conflictCount > 0 ? `
        <div class="summary-card warn">
          <div class="summary-number">${conflictCount}</div>
          <div class="summary-label">标题冲突</div>
        </div>` : ''}
        ${this._preview.categories.length > 0 ? `
        <div class="summary-card">
          <div class="summary-number">${this._preview.categories.length}</div>
          <div class="summary-label">新分类</div>
        </div>` : ''}
      </div>
      <div class="preview-list">
        ${this._preview.prompts.map((p, i) => {
          const isDup = this._preview.duplicates.some(d => d.title === p.title);
          const isConflict = this._preview.conflicts.some(c => c.title === p.title);
          const cls = isDup ? 'duplicate' : (isConflict ? 'conflict' : 'new');
          const icon = isDup ? '⏭' : (isConflict ? '⚠️' : '✅');
          return `
            <div class="preview-item ${cls}">
              <span style="margin-right:8px;">${icon}</span>
              <span>${escapeHtml(p.title)}</span>
              ${p.categoryId ? `<span style="margin-left:auto;font-size:11px;color:var(--text-tertiary);">📁</span>` : ''}
            </div>`;
        }).join('')}
      </div>
    `;

    importBtn.disabled = newCount === 0;
  }

  _setStep(step) {
    this._step = step;
    const uploadSection = this.shadowRoot.getElementById('upload-section');
    const previewSection = this.shadowRoot.getElementById('preview-section');
    const importingSection = this.shadowRoot.getElementById('importing-section');

    uploadSection?.classList.toggle('hidden', step !== 'upload');
    previewSection?.classList.toggle('hidden', step !== 'preview');
    importingSection?.classList.toggle('hidden', step !== 'importing');
  }

  _close() {
    this._parsedFiles = [];
    this._preview = null;
    this._step = 'upload';
    this.classList.remove('visible');
    this.shadowRoot.getElementById('upload-section')?.classList.remove('hidden');
    this.shadowRoot.getElementById('preview-section')?.classList.add('hidden');
    this.shadowRoot.getElementById('importing-section')?.classList.add('hidden');
    this.shadowRoot.getElementById('import-btn').disabled = true;
  }

  connectedCallback() {
    this.classList.add('visible');
  }
}

customElements.define('import-dialog', ImportDialog);

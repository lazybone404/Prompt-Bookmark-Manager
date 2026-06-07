/**
 * 确认对话框 — 用于删除等危险操作
 *
 * 用法：
 *   <confirm-dialog></confirm-dialog>
 *   dialog.show('确定要删除吗？', (confirmed) => { ... });
 */

class ConfirmDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._callback = null;
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
          z-index: 2000;
          align-items: center;
          justify-content: center;
        }

        :host(.visible) {
          display: flex;
        }

        .dialog {
          background: var(--bg-primary, #ffffff);
          border-radius: var(--radius-lg, 12px);
          padding: var(--space-xl, 24px);
          max-width: 360px;
          width: 85%;
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
          text-align: center;
        }

        .dialog-icon {
          font-size: 40px;
          margin-bottom: var(--space-md, 12px);
        }

        .dialog-message {
          font-size: 15px;
          color: var(--text-primary, #111827);
          margin-bottom: var(--space-lg, 16px);
          line-height: 1.5;
        }

        .dialog-actions {
          display: flex;
          gap: var(--space-sm, 8px);
          justify-content: center;
        }

        .btn {
          padding: 8px 24px;
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

        .btn-cancel:hover {
          background: var(--bg-tertiary, #f3f4f6);
        }

        .btn-danger {
          border: none;
          background: var(--color-danger, #ef4444);
          color: #ffffff;
        }

        .btn-danger:hover {
          background: var(--color-danger-hover, #dc2626);
        }
      </style>
      <div class="dialog">
        <div class="dialog-icon">⚠️</div>
        <div class="dialog-message" id="dialog-message"></div>
        <div class="dialog-actions">
          <button class="btn btn-cancel" id="cancel-btn">取消</button>
          <button class="btn btn-danger" id="confirm-btn">确定</button>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById('cancel-btn').addEventListener('click', () => this._resolve(false));
    this.shadowRoot.getElementById('confirm-btn').addEventListener('click', () => this._resolve(true));
    this.addEventListener('click', (e) => {
      if (e.target === this) this._resolve(false);
    });
  }

  show(message, callback) {
    this._callback = callback;
    this.shadowRoot.getElementById('dialog-message').textContent = message;
    this.classList.add('visible');
  }

  _resolve(result) {
    this.classList.remove('visible');
    if (this._callback) {
      this._callback(result);
      this._callback = null;
    }
  }
}

customElements.define('confirm-dialog', ConfirmDialog);

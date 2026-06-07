/**
 * Toast 通知组件 — 底部居中显示，2 秒自动消失
 *
 * 用法：
 *   <toast-message></toast-message>
 *   const toast = document.querySelector('toast-message');
 *   toast.show('已复制', 'success');
 */

class ToastMessage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.queue = [];
    this.visible = false;
    this.render();
  }

  static get observedAttributes() {
    return [];
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10000;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }

        .toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: var(--radius-full, 9999px);
          background: #1f2937;
          color: #ffffff;
          font-family: var(--font-family, sans-serif);
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          animation: slideUp 0.25s ease-out, fadeOut 0.3s ease-in 1.7s forwards;
          pointer-events: auto;
          white-space: nowrap;
        }

        .toast.success {
          background: #059669;
        }

        .toast.info {
          background: #4f46e5;
        }

        .toast.warning {
          background: #d97706;
        }

        .toast.error {
          background: #dc2626;
        }

        .toast-icon {
          font-size: 16px;
          line-height: 1;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
            transform: translateY(-4px);
          }
        }
      </style>
      <div id="toast-container"></div>
    `;
  }

  show(message, type = 'info') {
    const icons = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
    };

    const container = this.shadowRoot.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[type] || 'ℹ️';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;  // 安全：textContent 自动转义

    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    container.appendChild(toast);

    // 2 秒后自动移除
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 2000);
  }
}

customElements.define('toast-message', ToastMessage);

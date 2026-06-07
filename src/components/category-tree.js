/**
 * 分类树组件 — 递归展开/折叠
 *
 * 用法：
 *   <category-tree categories='[...]' prompts='[...]'></category-tree>
 *   tree.addEventListener('select-category', (e) => { id = e.detail.id; });
 *   tree.addEventListener('select-prompt', (e) => { prompt = e.detail; });
 *
 * 属性：
 *   categories - JSON 字符串，分类数组
 *   prompts - JSON 字符串，Prompt 数组
 *   selected-id - 当前选中的分类 ID
 */

import { buildCategoryTree, escapeHtml, flattenCategoryIds } from '../lib/utils.js';

class CategoryTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._categories = [];
    this._prompts = [];
    this._selectedId = null;
    this._expandedIds = new Set();
    this._editable = false;
    this.render();
  }

  static get observedAttributes() {
    return ['categories', 'prompts', 'selected-id', 'editable'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'categories') {
      try {
        this._categories = JSON.parse(newVal || '[]');
        this._renderTree();
      } catch (e) { /* ignore */ }
    }
    if (name === 'prompts') {
      try {
        this._prompts = JSON.parse(newVal || '[]');
        this._renderTree();
      } catch (e) { /* ignore */ }
    }
    if (name === 'selected-id') {
      this._selectedId = newVal || null;
      this._highlightSelected();
    }
    if (name === 'editable') {
      this._editable = newVal === 'true' || newVal === '';
      this._renderTree();
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          overflow-y: auto;
          font-family: var(--font-family, sans-serif);
        }

        .tree-root {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .tree-node {
          list-style: none;
        }

        .tree-item {
          display: flex;
          align-items: center;
          padding: 6px 12px;
          cursor: pointer;
          border-radius: var(--radius-sm, 4px);
          font-size: 13px;
          color: var(--text-primary, #111827);
          transition: background var(--transition-fast, 150ms);
          user-select: none;
        }

        .tree-item:hover {
          background: var(--bg-hover, #f0f0ff);
        }

        .tree-item.selected {
          background: var(--color-primary-light, #e0e7ff);
          color: var(--color-primary, #4f46e5);
          font-weight: 500;
        }

        .tree-toggle {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: var(--text-tertiary, #9ca3af);
          flex-shrink: 0;
          margin-right: 4px;
          transition: transform var(--transition-fast, 150ms);
        }

        .tree-toggle.expanded {
          transform: rotate(90deg);
        }

        .tree-toggle.leaf {
          visibility: hidden;
        }

        .tree-icon {
          margin-right: 6px;
          font-size: 14px;
          flex-shrink: 0;
        }

        .tree-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tree-count {
          font-size: 11px;
          color: var(--text-tertiary, #9ca3af);
          margin-left: 6px;
        }

        .tree-children {
          padding-left: 16px;
        }

        .tree-children.collapsed {
          display: none;
        }

        .prompt-item {
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          padding: 4px 12px 4px 48px;
          cursor: pointer;
          border-radius: var(--radius-sm, 4px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .prompt-item:hover {
          background: var(--bg-hover, #f0f0ff);
          color: var(--color-primary, #4f46e5);
        }

        /* 分类操作按钮 */
        .tree-actions {
          display: none;
          margin-left: auto;
          gap: 2px;
          flex-shrink: 0;
        }

        .tree-item:hover .tree-actions {
          display: flex;
        }

        .tree-action-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 12px;
          border-radius: var(--radius-sm, 4px);
          color: var(--text-tertiary, #9ca3af);
          transition: all var(--transition-fast, 150ms);
        }

        .tree-action-btn:hover {
          background: var(--bg-tertiary, #f3f4f6);
          color: var(--text-primary, #111827);
        }

        .tree-action-btn.delete-cat-btn:hover {
          background: #fee2e2;
          color: var(--color-danger, #ef4444);
        }

        /* 全部分类 */
        .all-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          border-radius: var(--radius-sm, 4px);
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #111827);
          margin-bottom: 4px;
          transition: background var(--transition-fast, 150ms);
        }

        .all-item:hover {
          background: var(--bg-hover, #f0f0ff);
        }

        .all-item.selected {
          background: var(--color-primary-light, #e0e7ff);
          color: var(--color-primary, #4f46e5);
        }
      </style>
      <div class="all-item" data-category-id="">
        <span class="tree-icon">📋</span>
        <span class="tree-name">全部 Prompt</span>
        <span class="tree-count">${this._prompts.length}</span>
      </div>
      <ul class="tree-root" id="tree-root"></ul>
    `;

    // 绑定"全部"点击
    this.shadowRoot.querySelector('.all-item').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('select-category', {
        detail: { id: null },
        bubbles: true,
        composed: true,
      }));
    });

    this._renderTree();
  }

  _renderTree() {
    const root = this.shadowRoot?.getElementById('tree-root');
    if (!root) return;

    const tree = buildCategoryTree(this._categories);
    root.innerHTML = tree.map(node => this._buildNodeHTML(node, 0)).join('');

    // 绑定事件
    root.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = item.dataset.categoryId;
        const hasChildren = item.dataset.hasChildren === 'true';

        if (hasChildren) {
          // 切换展开/折叠
          const childrenList = item.nextElementSibling;
          if (childrenList?.classList.contains('tree-children')) {
            childrenList.classList.toggle('collapsed');
            const toggle = item.querySelector('.tree-toggle');
            toggle?.classList.toggle('expanded');
          }
        }

        // 选中分类
        this.dispatchEvent(new CustomEvent('select-category', {
          detail: { id },
          bubbles: true,
          composed: true,
        }));
      });
    });

    // 绑定 Prompt 点击
    root.querySelectorAll('.prompt-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const promptId = item.dataset.promptId;
        const prompt = this._prompts.find(p => p.id === promptId);
        if (prompt) {
          this.dispatchEvent(new CustomEvent('select-prompt', {
            detail: prompt,
            bubbles: true,
            composed: true,
          }));
        }
      });
    });

    // 绑定分类编辑/删除按钮（仅在 editable 模式下）
    if (this._editable) {
      root.querySelectorAll('.edit-cat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const catId = btn.dataset.catId;
          const cat = this._categories.find(c => c.id === catId);
          if (cat) {
            this.dispatchEvent(new CustomEvent('edit-category', {
              detail: { id: cat.id, name: cat.name, parentId: cat.parentId || null },
              bubbles: true,
              composed: true,
            }));
          }
        });
      });

      root.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const catId = btn.dataset.catId;
          const cat = this._categories.find(c => c.id === catId);
          if (!cat) return;

          // 计算影响范围
          const tree = buildCategoryTree(this._categories);
          const findNode = (nodes, id) => {
            for (const node of nodes) {
              if (node.id === id) return node;
              const found = findNode(node.children, id);
              if (found) return found;
            }
            return null;
          };
          const node = findNode(tree, catId);
          const childIds = node ? flattenCategoryIds(node, false) : [];
          const affectedPromptCount = this._prompts.filter(
            p => p.categoryId === catId || childIds.includes(p.categoryId)
          ).length;

          this.dispatchEvent(new CustomEvent('delete-category', {
            detail: {
              id: cat.id,
              name: cat.name,
              childCount: childIds.length,
              affectedPromptCount,
            },
            bubbles: true,
            composed: true,
          }));
        });
      });
    }

    this._highlightSelected();
  }

  _buildNodeHTML(node, depth) {
    const hasChildCategories = node.children && node.children.length > 0;
    const promptsInCategory = this._prompts.filter(p => p.categoryId === node.id);
    // 有子分类 OR 有直接 Prompt → 可展开
    const hasExpandableContent = hasChildCategories || promptsInCategory.length > 0;
    const isExpanded = this._expandedIds.has(node.id);
    const isSelected = this._selectedId === node.id;

    let html = `
      <li class="tree-node">
        <div class="tree-item${isSelected ? ' selected' : ''}"
             data-category-id="${node.id}"
             data-has-children="${hasExpandableContent}">
          <span class="tree-toggle ${hasExpandableContent ? (isExpanded ? 'expanded' : '') : 'leaf'}">▶</span>
          <span class="tree-icon">${hasChildCategories ? '📁' : '📂'}</span>
          <span class="tree-name">${escapeHtml(node.name)}</span>
          <span class="tree-count">${promptsInCategory.length + (hasChildCategories ? this._countAllPrompts(node) - promptsInCategory.length : 0) || ''}</span>
          ${this._editable ? `
          <span class="tree-actions">
            <button class="tree-action-btn edit-cat-btn" data-cat-id="${node.id}" data-action="edit-cat" title="编辑分类">✏️</button>
            <button class="tree-action-btn delete-cat-btn" data-cat-id="${node.id}" data-action="delete-cat" title="删除分类">🗑</button>
          </span>` : ''}
        </div>`;

    if (hasExpandableContent) {
      html += `<ul class="tree-children${isExpanded ? '' : ' collapsed'}">`;
      for (const child of node.children) {
        html += this._buildNodeHTML(child, depth + 1);
      }
      // 显示该分类下的直接 Prompt
      for (const prompt of promptsInCategory) {
        html += `
          <li class="prompt-item" data-prompt-id="${prompt.id}" title="${escapeHtml(prompt.title)}">
            📋 ${escapeHtml(prompt.title)}
          </li>`;
      }
      html += '</ul>';
    }

    html += '</li>';
    return html;
  }

  _countAllPrompts(node) {
    let count = this._prompts.filter(p => p.categoryId === node.id).length;
    for (const child of (node.children || [])) {
      count += this._countAllPrompts(child);
    }
    return count;
  }

  _highlightSelected() {
    const root = this.shadowRoot;
    if (!root) return;

    root.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    root.querySelectorAll('.all-item.selected').forEach(el => el.classList.remove('selected'));

    if (!this._selectedId) {
      root.querySelector('.all-item')?.classList.add('selected');
    } else {
      const item = root.querySelector(`.tree-item[data-category-id="${this._selectedId}"]`);
      if (item) item.classList.add('selected');
    }
  }
}

customElements.define('category-tree', CategoryTree);

/**
 * Manager (Options Page) 入口 — 完整 CRUD + 分类管理 + 导入导出
 */

import { store } from '../lib/store.js';
import { searchPrompts } from '../lib/search.js';
import { buildCategoryTree, flattenCategoryIds, escapeHtml } from '../lib/utils.js';
import '../components/prompt-card.js';
import '../components/prompt-form.js';
import '../components/search-bar.js';
import '../components/toast.js';
import '../components/category-tree.js';
import '../components/confirm-dialog.js';
import '../components/import-dialog.js';
import '../components/export-dialog.js';

let currentCategoryId = null; // null = 显示全部
let currentSort = 'updatedAt';
let searchQuery = '';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await renderAll();
  setupEventListeners();
  updateStorageInfo();
});

// ========== 渲染 ==========

async function renderAll() {
  await renderCategories();
  await renderPromptList();
  await updateStorageInfo();
}

async function renderCategories() {
  const tree = document.querySelector('#sidebar-category-tree');
  if (!tree) return;

  const categories = Object.values(await store.getCategories());
  tree.setAttribute('categories', JSON.stringify(categories));
}

async function renderPromptList() {
  const container = document.getElementById('prompt-list');
  const emptyState = document.getElementById('empty-state');
  if (!container || !emptyState) return;

  let prompts = Object.values(await store.getPrompts());

  // 分类筛选
  if (currentCategoryId) {
    const categories = await store.getCategories();
    const tree = buildCategoryTree(Object.values(categories));
    const findNode = (nodes, id) => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNode(node.children, id);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(tree, currentCategoryId);
    if (node) {
      const categoryIds = flattenCategoryIds(node, true);
      prompts = prompts.filter(p => categoryIds.includes(p.categoryId));
    } else {
      prompts = prompts.filter(p => p.categoryId === currentCategoryId);
    }
  }

  // 搜索
  if (searchQuery.trim()) {
    const allPrompts = {};
    prompts.forEach(p => { allPrompts[p.id] = p; });
    prompts = searchPrompts(allPrompts, searchQuery);
  }

  // 排序
  prompts.sort((a, b) => {
    switch (currentSort) {
      case 'useCount':
        return (b.useCount || 0) - (a.useCount || 0);
      case 'title':
        return (a.title || '').localeCompare(b.title || '', 'zh');
      case 'createdAt':
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      case 'updatedAt':
      default:
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }
  });

  if (prompts.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    container.innerHTML = prompts.map(p => createPromptRow(p)).join('');
    bindRowEvents(container);
  }
}

function createPromptRow(prompt) {
  const title = escapeHtml(prompt.title || '未命名');
  const desc = escapeHtml((prompt.description || '').substring(0, 80));
  const useCount = prompt.useCount || 0;
  const isFav = prompt.favorite ? '★' : '☆';
  const favClass = prompt.favorite ? 'fav-active' : '';
  return `
    <div class="prompt-row" data-id="${prompt.id}">
      <div class="row-info">
        <div class="row-title">${title}</div>
        ${desc ? `<div class="row-desc">${desc}</div>` : ''}
        <div class="row-meta">
          <span class="meta-item">使用 ${useCount} 次</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-btn fav-btn ${favClass}" data-action="fav" data-id="${prompt.id}" title="收藏">${isFav}</button>
        <button class="icon-btn copy-btn" data-action="copy" data-id="${prompt.id}" title="复制">📋</button>
        <button class="icon-btn edit-btn" data-action="edit" data-id="${prompt.id}" title="编辑">✏️</button>
        <button class="icon-btn delete-btn" data-action="delete" data-id="${prompt.id}" title="删除">🗑</button>
      </div>
    </div>`;
}

function bindRowEvents(container) {
  container.querySelectorAll('.prompt-row').forEach(row => {
    row.addEventListener('click', async () => {
      const id = row.dataset.id;
      await editPrompt(id);
    });
  });

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await editPrompt(btn.dataset.id);
    });
  });

  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const prompt = await store.getPrompt(btn.dataset.id);
      if (prompt) {
        await navigator.clipboard.writeText(prompt.content);
        await store.usePrompt(btn.dataset.id);
        document.querySelector('toast-message')?.show('已复制', 'success');
        await renderPromptList();
      }
    });
  });

  container.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await store.toggleFavorite(btn.dataset.id);
      await renderPromptList();
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const prompt = await store.getPrompt(btn.dataset.id);
      if (!prompt) return;
      const confirmed = await confirmAction(`确定要删除 "${prompt.title}" 吗？此操作不可撤销。`);
      if (confirmed) {
        await store.deletePrompt(btn.dataset.id);
        document.querySelector('toast-message')?.show('已删除', 'info');
        await renderPromptList();
      }
    });
  });
}

// ========== 编辑 Prompt ==========

async function editPrompt(id) {
  const editor = document.getElementById('manager-editor');
  if (!editor) return;

  const prompt = id ? await store.getPrompt(id) : {};
  editor.classList.remove('hidden');
  editor.setAttribute('mode', id ? 'edit' : 'create');
  editor.setAttribute('prompt-data', JSON.stringify(prompt || {}));

  const categories = Object.values(await store.getCategories());
  editor.setAttribute('categories', JSON.stringify(categories));

  const onSave = async (e) => {
    await store.savePrompt(e.detail);
    editor.classList.add('hidden');
    cleanupEditorListeners();
    await renderAll();
    document.querySelector('toast-message')?.show('已保存', 'success');
  };

  const onClose = () => {
    editor.classList.add('hidden');
    cleanupEditorListeners();
  };

  const cleanupEditorListeners = () => {
    editor.removeEventListener('save', onSave);
    editor.removeEventListener('close', onClose);
  };

  editor.addEventListener('save', onSave);
  editor.addEventListener('close', onClose);
}

// ========== 事件监听 ==========

function setupEventListeners() {
  // 新建 Prompt
  document.getElementById('new-prompt-btn')?.addEventListener('click', () => editPrompt(null));

  // 新建分类
  document.getElementById('add-category-btn')?.addEventListener('click', async () => {
    openCategoryDialog('create');
  });

  // 排序切换
  document.getElementById('sort-select')?.addEventListener('change', async (e) => {
    currentSort = e.target.value;
    await renderPromptList();
  });

  // 分类选择/编辑/删除事件
  const categoryTree = document.getElementById('sidebar-category-tree');
  categoryTree?.addEventListener('select-category', (e) => {
    currentCategoryId = e.detail.id;
    renderPromptList();
    categoryTree.setAttribute('selected-id', currentCategoryId || '');
  });
  categoryTree?.addEventListener('edit-category', (e) => {
    openCategoryDialog('edit', e.detail);
  });
  categoryTree?.addEventListener('delete-category', async (e) => {
    const { id, name, childCount, affectedPromptCount } = e.detail;
    let msg = `确定要删除「${name}」吗？`;
    if (childCount > 0) msg += ` 其下 ${childCount} 个子分类也将被删除。`;
    if (affectedPromptCount > 0) msg += ` ${affectedPromptCount} 个 Prompt 将移至未分类。`;
    msg += ' 此操作不可撤销。';
    const confirmed = await confirmAction(msg);
    if (confirmed) {
      await store.deleteCategory(id);
      document.querySelector('toast-message')?.show('已删除分类', 'info');
      await renderAll();
    }
  });

  // 分类编辑 dialog 按钮
  // 点击遮罩关闭分类 dialog
  document.getElementById('category-dialog')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCategoryDialog();
  });

  document.getElementById('cat-dialog-close')?.addEventListener('click', closeCategoryDialog);
  document.getElementById('cat-dialog-cancel')?.addEventListener('click', closeCategoryDialog);
  document.getElementById('cat-dialog-save')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('cat-name-input');
    const parentSelect = document.getElementById('cat-parent-select');
    const name = nameInput?.value.trim();
    if (!name) {
      document.querySelector('toast-message')?.show('请输入分类名称', 'warning');
      return;
    }
    const parentId = parentSelect?.value || null;
    const dialog = document.getElementById('category-dialog');
    const editId = dialog?.dataset.editId;

    if (editId) {
      // 编辑模式
      await store.saveCategory({ id: editId, name, parentId });
      document.querySelector('toast-message')?.show('分类已更新', 'success');
    } else {
      // 新建模式
      await store.saveCategory({ name, parentId });
      document.querySelector('toast-message')?.show('分类已创建', 'success');
    }
    closeCategoryDialog();
    await renderAll();
  });

  // 搜索
  const searchBar = document.getElementById('manager-search');
  let debounceTimer;
  searchBar?.addEventListener('search-input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      searchQuery = e.detail.value;
      await renderPromptList();
    }, 200);
  });

  // 导入
  document.getElementById('import-btn')?.addEventListener('click', async () => {
    const dialog = document.getElementById('import-dialog');
    dialog?.classList.remove('hidden');
    dialog?.addEventListener('import-complete', async () => {
      dialog.classList.add('hidden');
      await renderAll();
      document.querySelector('toast-message')?.show('导入完成', 'success');
    }, { once: true });
  });

  // 导出
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    const dialog = document.getElementById('export-dialog');
    const prompts = Object.values(await store.getPrompts());
    const categories = Object.values(await store.getCategories());
    dialog?.classList.remove('hidden');
    dialog?.setAttribute('prompts', JSON.stringify(prompts));
    dialog?.setAttribute('categories', JSON.stringify(categories));
  });

  // 悬浮球设置
  document.getElementById('float-ball-settings-btn')?.addEventListener('click', () => openFloatBallSettings());
  document.getElementById('float-ball-settings-close')?.addEventListener('click', () => closeFloatBallSettings());
  document.getElementById('float-ball-enabled')?.addEventListener('change', async (e) => {
    await store.saveFloatBallSettings({ enabled: e.target.checked });
  });
  document.getElementById('whitelist-add-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('whitelist-add-input');
    const host = input.value.trim();
    if (!host) return;
    const settings = await store.getFloatBallSettings();
    // 标准化：提取域名
    let domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const pattern = `*://${domain}/*`;
    if (!settings.whitelist.includes(pattern)) {
      settings.whitelist.push(pattern);
      await store.saveFloatBallSettings({ whitelist: settings.whitelist });
      renderWhitelistItems(settings.whitelist);
    }
    input.value = '';
  });
  document.getElementById('reset-position-btn')?.addEventListener('click', async () => {
    await store.saveFloatBallSettings({ position: { edge: 'right' } });
  });

  // 监听存储变更
  store.addEventListener('change', async (e) => {
    if (e.detail.key === 'prompts' || e.detail.key === 'categories') {
      await renderAll();
    }
  });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    // Ctrl+K → 搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const input = document.getElementById('manager-search')?.shadowRoot?.querySelector('input');
      if (input) input.focus();
    }
    // Ctrl+N → 新建 Prompt
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      editPrompt(null);
    }
    // Escape → 关闭编辑器和对话框
    if (e.key === 'Escape') {
      const editor = document.getElementById('manager-editor');
      const importDlg = document.getElementById('import-dialog');
      const exportDlg = document.getElementById('export-dialog');
      const catDialog = document.getElementById('category-dialog');
      if (editor && !editor.classList.contains('hidden')) {
        editor.classList.add('hidden');
      }
      if (importDlg && !importDlg.classList.contains('hidden')) {
        importDlg.classList.add('hidden');
      }
      if (exportDlg && !exportDlg.classList.contains('hidden')) {
        exportDlg.classList.add('hidden');
      }
      if (catDialog && !catDialog.classList.contains('hidden')) {
        closeCategoryDialog();
      }
    }
  });
}

// ========== 存储信息 ==========

async function updateStorageInfo() {
  const info = document.getElementById('storage-info');
  if (!info) return;
  const bytes = await store.getStorageUsage();
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  info.textContent = `已用 ${mb}MB / 5MB`;
}

// ========== 分类编辑 Dialog ==========

async function openCategoryDialog(mode, data = {}) {
  const dialog = document.getElementById('category-dialog');
  const titleEl = document.getElementById('cat-dialog-title');
  const nameInput = document.getElementById('cat-name-input');
  const parentSelect = document.getElementById('cat-parent-select');

  if (!dialog || !titleEl || !nameInput || !parentSelect) return;

  if (mode === 'edit') {
    titleEl.textContent = '编辑分类';
    nameInput.value = data.name || '';
    dialog.dataset.editId = data.id;
  } else {
    titleEl.textContent = '新建分类';
    nameInput.value = '';
    delete dialog.dataset.editId;
  }

  // 构建父分类选择器（带层级缩进）
  const categories = Object.values(await store.getCategories());
  const tree = buildCategoryTree(categories);

  // 编辑模式下计算需要排除的 ID（自身 + 后代）
  let excludeIds = new Set();
  if (mode === 'edit' && data.id) {
    excludeIds.add(data.id);
    const findNode = (nodes, id) => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNode(node.children, id);
        if (found) return found;
      }
      return null;
    };
    const selfNode = findNode(tree, data.id);
    if (selfNode) {
      const descendantIds = flattenCategoryIds(selfNode, false);
      descendantIds.forEach(id => excludeIds.add(id));
    }
  }

  parentSelect.innerHTML = '<option value="">无（顶级分类）</option>';
  const addOptions = (nodes, depth) => {
    for (const cat of nodes) {
      if (excludeIds.has(cat.id)) continue;
      const prefix = depth > 0 ? '　'.repeat(depth) + '└ ' : '';
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = prefix + cat.name;
      if (mode === 'edit' && cat.id === data.parentId) {
        option.selected = true;
      }
      parentSelect.appendChild(option);
      if (cat.children?.length) addOptions(cat.children, depth + 1);
    }
  };
  addOptions(tree, 0);

  dialog.classList.remove('hidden');
  nameInput.focus();
}

function closeCategoryDialog() {
  const dialog = document.getElementById('category-dialog');
  if (dialog) {
    dialog.classList.add('hidden');
    delete dialog.dataset.editId;
  }
}

// ========== 工具 ==========

function confirmAction(message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm-dialog');
    if (!dialog) { resolve(true); return; }
    dialog.show(message, resolve);
  });
}

// ========== 悬浮球设置面板 ==========

async function openFloatBallSettings() {
  const panel = document.getElementById('float-ball-settings-panel');
  if (!panel) return;
  panel.classList.remove('hidden');

  const settings = await store.getFloatBallSettings();
  document.getElementById('float-ball-enabled').checked = settings.enabled !== false;
  renderWhitelistItems(settings.whitelist || []);
}

function closeFloatBallSettings() {
  document.getElementById('float-ball-settings-panel')?.classList.add('hidden');
}

function renderWhitelistItems(whitelist) {
  const container = document.getElementById('whitelist-items');
  if (!container) return;
  if (whitelist.length === 0) {
    container.innerHTML = '<div class="whitelist-item" style="color:var(--text-tertiary)">暂无网站</div>';
    return;
  }
  container.innerHTML = whitelist.map(pattern => {
    const domain = pattern.replace(/^\*:\/\//, '').replace(/\/\*$/, '');
    return `<div class="whitelist-item">
      <span>${escapeHtml(domain)}</span>
      <button class="whitelist-remove-btn" data-pattern="${escapeHtml(pattern)}">✕</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.whitelist-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pattern = btn.dataset.pattern;
      const settings = await store.getFloatBallSettings();
      settings.whitelist = settings.whitelist.filter(p => p !== pattern);
      await store.saveFloatBallSettings({ whitelist: settings.whitelist });
      renderWhitelistItems(settings.whitelist);
    });
  });
}

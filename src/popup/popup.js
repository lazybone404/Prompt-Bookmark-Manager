/**
 * Popup 入口 — 快速访问 Prompt
 */

import { store } from '../lib/store.js';
import { searchPrompts } from '../lib/search.js';
import { escapeHtml } from '../lib/utils.js';
import { getDraft } from '../lib/draft.js';
import '../components/prompt-card.js';
import '../components/search-bar.js';
import '../components/toast.js';
import '../components/category-tree.js';
import '../components/prompt-form.js';

// 当前 Tab 状态
let currentTab = 'recent';
let searchQuery = '';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupSearch();
  setupManagerLink();
  await checkPendingPrompt();
  await checkDrafts();
  await renderCurrentTab();
});

// ========== Tab 切换 ==========

function setupTabs() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      // 更新激活状态
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换内容
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      const tab = btn.dataset.tab;
      currentTab = tab;
      document.getElementById(`tab-${tab}`)?.classList.add('active');

      // 特殊处理搜索 Tab
      const searchInput = document.getElementById('main-search');
      if (tab === 'search') {
        searchInput?.setAttribute('focused', 'true');
      }

      await renderCurrentTab();
    });
  });
}

// ========== 搜索 ==========

function setupSearch() {
  const searchBar = document.getElementById('main-search');
  if (!searchBar) return;

  let debounceTimer;
  searchBar.addEventListener('search-input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      searchQuery = e.detail.value;
      if (currentTab === 'search') {
        await renderSearchResults();
      }
    }, 200);
  });

  // 点击搜索栏自动切换到搜索 Tab
  searchBar.addEventListener('click', () => {
    switchTab('search');
  });
}

function switchTab(tab) {
  const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if (btn) btn.click();
}

// ========== 渲染 ==========

async function renderCurrentTab() {
  switch (currentTab) {
    case 'recent':
      await renderRecent();
      break;
    case 'favorites':
      await renderFavorites();
      break;
    case 'search':
      await renderSearchResults();
      break;
    case 'categories':
      await renderCategories();
      break;
  }
}

async function renderRecent() {
  const container = document.getElementById('recent-list');
  if (!container) return;

  const prompts = await store.getPrompts();
  const list = Object.values(prompts)
    .filter(p => p.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
    .slice(0, 20);

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🕐</div><div class="empty-title">暂无使用记录</div><div class="empty-desc">复制一条 Prompt 后就会出现在这里</div></div>';
    return;
  }

  container.innerHTML = list.map(p => createCardHTML(p)).join('');
  bindCardEvents(container);
}

async function renderFavorites() {
  const container = document.getElementById('favorites-list');
  if (!container) return;

  const prompts = await store.getPrompts();
  const list = Object.values(prompts)
    .filter(p => p.favorite)
    .sort((a, b) => b.useCount - a.useCount);

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-title">暂无收藏</div><div class="empty-desc">点击 Prompt 旁边的星标即可收藏</div></div>';
    return;
  }

  container.innerHTML = list.map(p => createCardHTML(p)).join('');
  bindCardEvents(container);
}

async function renderSearchResults() {
  const container = document.getElementById('search-results');
  if (!container) return;

  if (!searchQuery.trim()) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">输入关键词搜索</div><div class="empty-desc">支持搜索标题和内容</div></div>';
    return;
  }

  const prompts = await store.getPrompts();
  const results = searchPrompts(prompts, searchQuery);

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">未找到 "${escapeHtml(searchQuery)}"</div><div class="empty-desc">试试其他关键词</div></div>`;
    return;
  }

  container.innerHTML = results.map(p => createCardHTML(p)).join('');
  bindCardEvents(container);
}

async function renderCategories() {
  const container = document.getElementById('category-tree-container');
  if (!container) return;

  // 移除旧树（如果存在）
  const oldTree = container.querySelector('category-tree');
  if (oldTree) oldTree.remove();

  // 动态创建 category-tree 元素
  const tree = document.createElement('category-tree');
  const prompts = await store.getPrompts();
  const categories = await store.getCategories();
  tree.setAttribute('categories', JSON.stringify(Object.values(categories)));
  tree.setAttribute('prompts', JSON.stringify(Object.values(prompts)));

  tree.addEventListener('select-prompt', (e) => {
    const promptId = e.detail?.id;
    if (promptId) handleCopy(promptId);
  });

  container.appendChild(tree);
}

// ========== 卡片 HTML ==========

function createCardHTML(prompt) {
  const title = escapeHtml(prompt.title || '未命名');
  const desc = escapeHtml((prompt.description || '').substring(0, 60));
  const useCount = prompt.useCount || 0;
  const isFav = prompt.favorite ? '★' : '☆';
  const favClass = prompt.favorite ? 'fav-active' : '';
  return `
    <div class="prompt-card-item" data-id="${prompt.id}">
      <div class="card-left">
        <div class="card-title">${title}</div>
        ${desc ? `<div class="card-desc">${desc}</div>` : ''}
        <div class="card-meta">使用 ${useCount} 次</div>
      </div>
      <div class="card-actions">
        <button class="card-btn fav-btn ${favClass}" data-action="fav" data-id="${prompt.id}" title="收藏">${isFav}</button>
        <button class="card-btn copy-btn" data-action="copy" data-id="${prompt.id}" title="复制">📋</button>
        <button class="card-btn preview-btn" data-action="preview" data-id="${prompt.id}" title="预览">👁</button>
      </div>
    </div>`;
}

function bindCardEvents(container) {
  container.querySelectorAll('.card-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'copy') {
        await handleCopy(id);
      } else if (action === 'preview') {
        await handlePreview(id);
      } else if (action === 'fav') {
        await handleFavorite(id);
      }
    });
  });
}

// ========== 操作 ==========

async function handleCopy(promptId) {
  const prompt = await store.getPrompt(promptId);
  if (!prompt) return;

  await navigator.clipboard.writeText(prompt.content);
  await store.usePrompt(promptId);

  const toast = document.querySelector('toast-message');
  toast?.show('已复制', 'success');

  // 如果当前在最近使用 Tab，刷新列表
  if (currentTab === 'recent') {
    await renderRecent();
  }
}

async function handlePreview(promptId) {
  const prompt = await store.getPrompt(promptId);
  if (!prompt) return;

  // 使用 prompt-form 组件作为预览/编辑
  const editor = document.getElementById('popup-editor');
  if (!editor) return;

  editor.classList.remove('hidden');
  editor.setAttribute('mode', 'preview');
  editor.setAttribute('prompt-data', JSON.stringify(prompt));
  editor.scrollIntoView({ behavior: 'smooth' });

  // 编辑/保存事件
  const onSave = async (e) => {
    await store.savePrompt(e.detail);
    editor.classList.add('hidden');
    cleanupEditorListeners();
    await renderCurrentTab();
    const toast = document.querySelector('toast-message');
    toast?.show('已保存', 'success');
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(prompt.content);
    await store.usePrompt(promptId);
    const toast = document.querySelector('toast-message');
    toast?.show('已复制', 'success');
  };

  const onClose = () => {
    editor.classList.add('hidden');
    cleanupEditorListeners();
  };

  const cleanupEditorListeners = () => {
    editor.removeEventListener('save', onSave);
    editor.removeEventListener('copy', onCopy);
    editor.removeEventListener('close', onClose);
  };

  editor.addEventListener('save', onSave);
  editor.addEventListener('copy', onCopy);
  editor.addEventListener('close', onClose);
}

async function handleFavorite(promptId) {
  await store.toggleFavorite(promptId);
  await renderCurrentTab();
}

// ========== 键盘快捷键 ==========

document.addEventListener('keydown', async (e) => {
  // Ctrl+K / Cmd+K → 聚焦搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    switchTab('search');
    const input = document.getElementById('main-search')?.shadowRoot?.querySelector('input');
    if (input) setTimeout(() => input.focus(), 100);
  }
  // Escape → 关闭编辑器
  if (e.key === 'Escape') {
    const editor = document.getElementById('popup-editor');
    if (editor && !editor.classList.contains('hidden')) {
      editor.classList.add('hidden');
    }
  }
  // ↑↓ 在列表中导航（仅在编辑器隐藏时）
  if (['ArrowUp', 'ArrowDown'].includes(e.key) && document.getElementById('popup-editor')?.classList.contains('hidden')) {
    // 仅在未编辑状态下导航
  }
});

function setupManagerLink() {
  document.getElementById('open-manager-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// ========== 右键菜单预填 ==========

async function checkPendingPrompt() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-pending-prompt' });
    if (response && response.content) {
      // 打开编辑器并预填内容
      const editor = document.getElementById('popup-editor');
      editor?.classList.remove('hidden');
      editor?.setAttribute('mode', 'edit');
      editor?.setAttribute('prompt-data', JSON.stringify({
        content: response.content,
        title: response.sourceTitle || '',
        description: `来源: ${response.sourceUrl || '网页选中'}`,
      }));
      editor?.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    // 忽略错误（可能不在扩展上下文中）
  }
}

// ========== 草稿恢复 ==========

async function checkDrafts() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-pending-prompt' });
    // 如果已经有 pending prompt，优先处理那个
    if (response && response.content) return;
  } catch (e) { /* ignore */ }

  const drafts = await store.getDrafts();
  const draftIds = Object.keys(drafts);
  if (draftIds.length === 0) return;

  // 只处理第一个草稿
  const firstDraft = drafts[draftIds[0]];
  const container = document.getElementById('recent-list');
  if (container) {
    const banner = document.createElement('div');
    banner.className = 'draft-banner';
    banner.innerHTML = `
      <div class="draft-banner-content">
        <span>⚠️ 有未保存的编辑</span>
        <small>${escapeHtml(firstDraft.title || '未命名')}</small>
      </div>
      <div class="draft-banner-actions">
        <button class="text-btn restore-draft-btn" data-draft-id="${firstDraft.promptId}">恢复</button>
        <button class="text-btn discard-draft-btn" data-draft-id="${firstDraft.promptId}">丢弃</button>
      </div>
    `;
    container.prepend(banner);

    banner.querySelector('.restore-draft-btn')?.addEventListener('click', async () => {
      await handlePreview(firstDraft.promptId);
      banner.remove();
    });

    banner.querySelector('.discard-draft-btn')?.addEventListener('click', async () => {
      await store.deleteDraft(firstDraft.promptId);
      banner.remove();
    });
  }
}

// ========== 监听存储变更 ==========

store.addEventListener('change', async (e) => {
  if (e.detail.key === 'prompts' || e.detail.key === 'categories') {
    await renderCurrentTab();
  }
});

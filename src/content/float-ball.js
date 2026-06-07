/**
 * 悬浮球 Content Script — AI 网站快速访问 Prompt
 *
 * 自包含实现：Shadow DOM 样式隔离、拖拽、3 Tab 面板、搜索、预览、右键菜单
 * 直接使用 chrome.storage.local（content script 不支持静态 ES module import）
 */

(function () {
  'use strict';

  // ========== 常量 ==========

  const PANEL_WIDTH = 380;
  const PANEL_HEIGHT = 520;
  const MIN_PANEL_WIDTH = 300;
  const MIN_PANEL_HEIGHT = 350;
  const BALL_SIZE = 48;
  const BALL_MARGIN = 12;

  // ========== 状态 ==========

  let currentTab = 'recent';
  let searchQuery = '';
  let panelVisible = false;
  let dragging = false;
  let dragStartX, dragStartY, dragStartBallX, dragStartBallY;
  let movedDuringPointer = false;

  // ========== 初始化检查 ==========

  async function init() {
    const settings = await getSettings();
    if (!settings.enabled) return;

    // 检查白名单
    const host = window.location.host;
    const protocol = window.location.protocol;
    const currentUrl = `${protocol}//${host}/*`;
    const inWhitelist = settings.whitelist.some(pattern => {
      return matchPattern(pattern, currentUrl) || matchPattern(pattern, window.location.href);
    });
    if (!inWhitelist) return;

    // 检查隐藏到期时间
    const hiddenUntil = settings.hiddenUntil?.[host];
    if (hiddenUntil && Date.now() < hiddenUntil) return;

    // 清理过期的隐藏
    if (hiddenUntil && Date.now() >= hiddenUntil) {
      delete settings.hiddenUntil[host];
      await saveSettings({ hiddenUntil: settings.hiddenUntil });
    }

    buildUI();
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  function matchPattern(pattern, url) {
    // 安全：先转义正则特殊字符，再将通配符 * 替换为 .*
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp('^' + escaped + '$');
    return regex.test(url);
  }

  // ========== 数据层 ==========

  async function loadPrompts() {
    const result = await chrome.storage.local.get(['prompts', 'categories']);
    return {
      prompts: result.prompts || {},
      categories: result.categories || {},
    };
  }

  async function getSettings() {
    const result = await chrome.storage.local.get('meta');
    const meta = result.meta || {};
    const defaults = {
      enabled: true,
      whitelist: [
        '*://chatgpt.com/*', '*://chat.openai.com/*', '*://claude.ai/*',
        '*://chat.deepseek.com/*', '*://kimi.moonshot.cn/*', '*://tongyi.aliyun.com/*',
        '*://yiyan.baidu.com/*', '*://xinghuo.xfyun.cn/*', '*://gemini.google.com/*',
        '*://copilot.microsoft.com/*', '*://poe.com/*', '*://chat.mistral.ai/*',
        '*://huggingface.co/chat/*', '*://meta.ai/*',
      ],
      hiddenUntil: {},
      position: { edge: 'right' },
    };
    if (!meta.floatBallSettings) {
      meta.floatBallSettings = defaults;
    }
    // 补齐可能缺失的字段（旧版本升级兼容）
    return { ...defaults, ...meta.floatBallSettings };
  }

  async function saveSettings(partial) {
    const result = await chrome.storage.local.get('meta');
    const meta = result.meta || {};
    meta.floatBallSettings = { ...meta.floatBallSettings, ...partial };
    await chrome.storage.local.set({ meta });
  }

  async function updateUseCount(promptId) {
    const result = await chrome.storage.local.get('prompts');
    const prompts = result.prompts || {};
    if (prompts[promptId]) {
      prompts[promptId].useCount = (prompts[promptId].useCount || 0) + 1;
      prompts[promptId].lastUsedAt = new Date().toISOString();
      await chrome.storage.local.set({ prompts });
    }
  }

  function handleStorageChange(changes) {
    if (changes.prompts || changes.categories) {
      if (panelVisible) renderCurrentTab();
    }
  }

  // ========== UI 构建 ==========

  function buildUI() {
    const host = document.createElement('div');
    host.id = 'promfinder-float-ball-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>${getStyles()}</style>
      <div class="ball-wrapper" id="wrapper">
        <div class="float-ball" id="float-ball" title="Prompt 收藏夹">
          <span class="ball-icon">📋</span>
        </div>
        <div class="mini-panel hidden" id="mini-panel">
          <div class="panel-resize-handle" id="resize-handle"></div>
          <div class="panel-header">
            <input class="panel-search" id="panel-search" type="text" placeholder="🔍 搜索 Prompt...">
          </div>
          <div class="panel-tabs" id="panel-tabs">
            <button class="tab-btn active" data-tab="recent">🕐 最近</button>
            <button class="tab-btn" data-tab="favorites">⭐ 收藏</button>
            <button class="tab-btn" data-tab="categories">📁 分类</button>
          </div>
          <div class="panel-content" id="panel-content">
            <div class="panel-list" id="panel-list"></div>
          </div>
          <div class="panel-footer">
            <button class="footer-btn" id="open-manager-btn">⚙️ 打开管理</button>
          </div>
          <div class="toast" id="panel-toast"></div>
        </div>
        <div class="context-menu hidden" id="context-menu">
          <div class="context-item" data-action="hide-24h">🔕 在此网站隐藏 24 小时</div>
          <div class="context-item" data-action="open-manager">⚙️ 管理白名单...</div>
        </div>
      </div>
    `;

    document.body.appendChild(host);

    // 缓存 DOM 引用
    window.__pf = {
      shadow,
      wrapper: shadow.getElementById('wrapper'),
      ball: shadow.getElementById('float-ball'),
      panel: shadow.getElementById('mini-panel'),
      panelContent: shadow.getElementById('panel-content'),
      panelList: shadow.getElementById('panel-list'),
      panelSearch: shadow.getElementById('panel-search'),
      panelTabs: shadow.getElementById('panel-tabs'),
      toast: shadow.getElementById('panel-toast'),
      contextMenu: shadow.getElementById('context-menu'),
      resizeHandle: shadow.getElementById('resize-handle'),
      openManagerBtn: shadow.getElementById('open-manager-btn'),
    };

    bindEvents();
    restorePosition();
  }

  function bindEvents() {
    const { ball, panelSearch, panelTabs, panel, contextMenu, resizeHandle } = window.__pf;
    const shadow = window.__pf.shadow;

    // 悬浮球拖拽
    ball.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // 点击悬浮球（非拖拽时展开/收起）
    ball.addEventListener('click', (e) => {
      if (movedDuringPointer) return;
      togglePanel();
    });

    // 右键菜单
    ball.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e);
    });

    // 搜索栏：输入即过滤，清空回原 Tab
    let searchTimer;
    let previousTab = 'recent';
    panelSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        searchQuery = panelSearch.value.trim();
        if (searchQuery) {
          previousTab = currentTab;
          await renderSearchResults();
        } else {
          currentTab = previousTab;
          panelTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          const activeBtn = panelTabs.querySelector(`.tab-btn[data-tab="${currentTab}"]`);
          if (activeBtn) activeBtn.classList.add('active');
          await renderCurrentTab();
        }
      }, 200);
    });

    // Tab 切换
    panelTabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        panelTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        searchQuery = '';
        panelSearch.value = '';
        await renderCurrentTab();
      });
    });

    // 打开管理页 — 通过 SW 打开（SW 负责 openOptionsPage / tabs.create fallback）
    window.__pf.openManagerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'open-options' });
    });

    // 右键菜单项
    contextMenu.querySelectorAll('.context-item').forEach(item => {
      item.addEventListener('click', async () => {
        const action = item.dataset.action;
        contextMenu.classList.add('hidden');
        if (action === 'hide-24h') {
          await hideFor24h();
        } else if (action === 'open-manager') {
          chrome.runtime.sendMessage({ type: 'open-options' });
        }
      });
    });

    // 面板缩放
    let resizing = false;
    let resizeStartX, resizeStartY, resizeStartW, resizeStartH;

    resizeHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      resizeStartW = rect.width;
      resizeStartH = rect.height;
      panel.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      const dx = e.clientX - resizeStartX;
      const dy = e.clientY - resizeStartY;
      const newW = Math.max(MIN_PANEL_WIDTH, resizeStartW + dx);
      const newH = Math.max(MIN_PANEL_HEIGHT, resizeStartH + dy);
      panel.style.width = newW + 'px';
      panel.style.height = newH + 'px';
    });

    window.addEventListener('pointerup', () => {
      if (resizing) {
        resizing = false;
        savePanelSize();
      }
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!panelVisible) return;
      const host = document.getElementById('promfinder-float-ball-host');
      if (!host) return;
      if (!host.contains(e.target) && e.target !== host) {
        setTimeout(() => {
          if (panelVisible && !window.__pf.panel.classList.contains('hidden')) {
            const ballEl = window.__pf.ball;
            if (e.target !== ballEl && !ballEl.contains(e.target)) {
              hidePanel();
            }
          }
        }, 100);
      }
    });

    // Esc 关闭面板 + 右键菜单
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (panelVisible) {
          hidePanel();
          contextMenu.classList.add('hidden');
        }
      }
    });
  }

  // ========== 拖拽 ==========

  function onPointerDown(e) {
    dragging = true;
    movedDuringPointer = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const ball = window.__pf.ball;
    const rect = ball.getBoundingClientRect();
    dragStartBallX = rect.left;
    dragStartBallY = rect.top;
    ball.setPointerCapture(e.pointerId);
    ball.style.transition = 'none';
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedDuringPointer = true;
    }
    if (!movedDuringPointer) return;
    const wrapper = window.__pf.wrapper;
    const newX = dragStartBallX + dx;
    const newY = Math.max(0, Math.min(window.innerHeight - BALL_SIZE, dragStartBallY + dy));
    wrapper.style.left = newX + 'px';
    wrapper.style.top = newY + 'px';
    wrapper.style.right = 'auto';
    wrapper.style.bottom = 'auto';
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const ball = window.__pf.ball;
    ball.style.transition = 'transform 0.25s ease, left 0.25s ease, right 0.25s ease';
    ball.releasePointerCapture(e.pointerId);

    if (movedDuringPointer) {
      snapToEdge();
    }
  }

  function snapToEdge() {
    const wrapper = window.__pf.wrapper;
    const panel = window.__pf.panel;
    const ball = window.__pf.ball;
    const rect = ball.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const edge = centerX < window.innerWidth / 2 ? 'left' : 'right';

    wrapper.style.transition = 'left 0.25s ease, right 0.25s ease, top 0.25s ease';
    wrapper.style.left = 'auto';
    wrapper.style.right = 'auto';

    if (edge === 'left') {
      wrapper.style.left = BALL_MARGIN + 'px';
      wrapper.style.right = 'auto';
      panel.style.left = (BALL_SIZE + BALL_MARGIN + 8) + 'px';
      panel.style.right = 'auto';
    } else {
      wrapper.style.right = BALL_MARGIN + 'px';
      wrapper.style.left = 'auto';
      panel.style.right = (BALL_SIZE + BALL_MARGIN + 8) + 'px';
      panel.style.left = 'auto';
    }

    panel.style.top = '50%';
    panel.style.transform = 'translateY(-50%)';
    panel.style.bottom = 'auto';

    // 保存位置
    setTimeout(async () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      await saveSettings({
        position: {
          x: wrapperRect.left,
          y: wrapperRect.top,
          edge,
        },
      });
    }, 300);
  }

  function restorePosition() {
    getSettings().then(settings => {
      const pos = settings.position;
      const wrapper = window.__pf.wrapper;
      const panel = window.__pf.panel;
      const maxX = window.innerWidth - BALL_SIZE - BALL_MARGIN;
      const maxY = window.innerHeight - BALL_SIZE;

      wrapper.style.left = 'auto';
      wrapper.style.right = 'auto';

      // 越界保护：clamp 到当前窗口可见范围
      if (pos.edge === 'left' || (!pos.edge && (pos.x || BALL_MARGIN) < window.innerWidth / 2)) {
        const x = Math.min(maxX, Math.max(BALL_MARGIN, pos.x || BALL_MARGIN));
        wrapper.style.left = x + 'px';
        wrapper.style.right = 'auto';
        panel.style.left = (BALL_SIZE + BALL_MARGIN + 8) + 'px';
        panel.style.right = 'auto';
      } else {
        wrapper.style.right = BALL_MARGIN + 'px';
        wrapper.style.left = 'auto';
        panel.style.right = (BALL_SIZE + BALL_MARGIN + 8) + 'px';
        panel.style.left = 'auto';
      }

      if (pos.y) {
        wrapper.style.top = Math.min(maxY, Math.max(0, pos.y)) + 'px';
        wrapper.style.bottom = 'auto';
      } else {
        wrapper.style.top = '50%';
        wrapper.style.transform = 'translateY(-50%)';
      }

      panel.style.top = '50%';
      panel.style.transform = 'translateY(-50%)';
      panel.style.bottom = 'auto';
    });
  }

  // ========== 面板控制 ==========

  function togglePanel() {
    if (panelVisible) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  function showPanel() {
    const panel = window.__pf.panel;
    panel.classList.remove('hidden');
    panelVisible = true;
    renderCurrentTab();
  }

  function hidePanel() {
    const panel = window.__pf.panel;
    const contextMenu = window.__pf.contextMenu;
    panel.classList.add('hidden');
    contextMenu.classList.add('hidden');
    panelVisible = false;
  }

  async function savePanelSize() {
    const panel = window.__pf.panel;
    const rect = panel.getBoundingClientRect();
    await saveSettings({ panelSize: { width: rect.width, height: rect.height } });
  }

  // 恢复面板尺寸
  getSettings().then(settings => {
    if (settings.panelSize) {
      const panel = window.__pf?.panel;
      if (panel) {
        panel.style.width = settings.panelSize.width + 'px';
        panel.style.height = settings.panelSize.height + 'px';
      }
    }
  });

  // ========== 右键菜单 ==========

  function showContextMenu(e) {
    const menu = window.__pf.contextMenu;
    const ball = window.__pf.ball;
    const rect = ball.getBoundingClientRect();

    menu.style.top = (rect.top - 10) + 'px';
    if (rect.left < window.innerWidth / 2) {
      menu.style.left = (rect.right + 8) + 'px';
      menu.style.right = 'auto';
    } else {
      menu.style.right = (window.innerWidth - rect.left + 8) + 'px';
      menu.style.left = 'auto';
    }
    menu.classList.remove('hidden');
  }

  async function hideFor24h() {
    const host = window.location.host;
    const until = Date.now() + 24 * 60 * 60 * 1000;
    const settings = await getSettings();
    settings.hiddenUntil = settings.hiddenUntil || {};
    settings.hiddenUntil[host] = until;
    await saveSettings({ hiddenUntil: settings.hiddenUntil });
    removeUI();
  }

  function removeUI() {
    const host = document.getElementById('promfinder-float-ball-host');
    if (host) host.remove();
    chrome.storage.onChanged.removeListener(handleStorageChange);
  }

  // ========== Tab 渲染 ==========

  async function renderCurrentTab() {
    switch (currentTab) {
      case 'recent': await renderRecent(); break;
      case 'favorites': await renderFavorites(); break;
      case 'categories': await renderCategories(); break;
    }
  }

  async function renderRecent() {
    const { prompts } = await loadPrompts();
    const list = Object.values(prompts)
      .filter(p => p.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
      .slice(0, 20);

    if (list.length === 0) {
      renderEmpty('🕐', '暂无使用记录', '复制一条 Prompt 后就会出现在这里');
      return;
    }
    renderPromptList(list);
  }

  async function renderFavorites() {
    const { prompts } = await loadPrompts();
    const list = Object.values(prompts)
      .filter(p => p.favorite)
      .sort((a, b) => b.useCount - a.useCount);

    if (list.length === 0) {
      renderEmpty('⭐', '暂无收藏', '点击 Prompt 旁边的星标即可收藏');
      return;
    }
    renderPromptList(list);
  }

  async function renderSearchResults() {
    if (!searchQuery) { renderEmpty('🔍', '输入关键词搜索', '支持搜索标题和内容'); return; }
    const { prompts } = await loadPrompts();
    const q = searchQuery.toLowerCase();
    // 搜索：先标题匹配，后内容匹配
    const titleMatches = [];
    const contentMatches = [];
    for (const p of Object.values(prompts)) {
      if ((p.title || '').toLowerCase().includes(q)) {
        titleMatches.push(p);
      } else if ((p.content || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) {
        contentMatches.push(p);
      }
    }
    const results = [...titleMatches, ...contentMatches];
    if (results.length === 0) {
      renderEmpty('🔍', `未找到 "${escapeHtml(searchQuery)}"`, '试试其他关键词');
      return;
    }
    renderPromptList(results);
  }

  async function renderCategories() {
    const { prompts, categories } = await loadPrompts();
    const catList = Object.values(categories);
    if (catList.length === 0) {
      renderEmpty('📁', '暂无分类', '在管理页中创建分类来组织 Prompt');
      return;
    }

    const tree = buildCategoryTree(catList);
    const promptList = Object.values(prompts);
    const container = window.__pf.panelList;
    container.innerHTML = `
      <div class="cat-all-item" data-cat-id="">
        <span>📋 全部 Prompt</span>
        <span class="cat-count">${promptList.length}</span>
      </div>
      ${renderCategoryNodes(tree, promptList)}
    `;

    // 绑定分类点击
    container.querySelectorAll('.cat-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const hasChildren = el.dataset.hasChildren === 'true';
        if (hasChildren) {
          const childrenList = el.nextElementSibling;
          if (childrenList?.classList.contains('cat-children')) {
            childrenList.classList.toggle('collapsed');
            el.querySelector('.cat-toggle')?.classList.toggle('expanded');
          }
        }
        // 选中高亮
        container.querySelectorAll('.cat-item.selected, .cat-all-item.selected').forEach(item => item.classList.remove('selected'));
        el.classList.add('selected');
        const catId = el.dataset.catId;
        filterByCategory(catId, promptList, catList);
      });
    });

    container.querySelectorAll('.cat-all-item').forEach(el => {
      el.addEventListener('click', () => {
        const panelList = window.__pf.panelList;
        panelList.querySelectorAll('.cat-item.selected, .cat-all-item.selected').forEach(item => item.classList.remove('selected'));
        el.classList.add('selected');
        renderPromptList(promptList);
      });
    });

    container.querySelectorAll('.cat-prompt-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const promptId = el.dataset.promptId;
        const prompt = promptList.find(p => p.id === promptId);
        if (prompt) await copyPrompt(prompt);
      });
    });
  }

  function renderCategoryNodes(nodes, allPrompts, depth = 0) {
    // 预计算每个分类的 Prompt 总数（递归包含子分类），O(P+C) 单次遍历
    const promptCountMap = new Map();
    for (const p of allPrompts) {
      if (p.categoryId) {
        promptCountMap.set(p.categoryId, (promptCountMap.get(p.categoryId) || 0) + 1);
      }
    }
    function countRecursive(node) {
      let total = promptCountMap.get(node.id) || 0;
      for (const child of (node.children || [])) {
        total += countRecursive(child);
      }
      node._totalCount = total;
      return total;
    }
    for (const node of nodes) countRecursive(node);

    let html = '';
    for (const node of nodes) {
      const hasChildCategories = node.children && node.children.length > 0;
      const directPrompts = allPrompts.filter(p => p.categoryId === node.id);
      const hasExpandableContent = hasChildCategories || directPrompts.length > 0;
      const totalCount = node._totalCount || 0;
      html += `
        <div class="cat-item" data-cat-id="${node.id}" data-has-children="${hasExpandableContent}" style="padding-left:${depth * 16 + 12}px">
          <span class="cat-toggle ${hasExpandableContent ? '' : 'leaf'}">▶</span>
          <span class="cat-icon">${hasChildCategories ? '📁' : '📂'}</span>
          <span class="cat-name">${escapeHtml(node.name)}</span>
          <span class="cat-count">${totalCount || ''}</span>
        </div>`;
      if (hasExpandableContent) {
        html += `<div class="cat-children">`;
        html += renderCategoryNodes(node.children, allPrompts, depth + 1);
        for (const p of directPrompts) {
          html += `<div class="cat-prompt-item" data-prompt-id="${p.id}">📋 ${escapeHtml(p.title)}</div>`;
        }
        html += `</div>`;
      }
    }
    return html;
  }

  function filterByCategory(catId, allPrompts, categories) {
    if (!catId) {
      renderPromptList(allPrompts);
      return;
    }
    const tree = buildCategoryTree(categories);
    const node = findCategoryNode(tree, catId);
    if (!node) {
      renderPromptList(allPrompts.filter(p => p.categoryId === catId));
      return;
    }
    const ids = flattenCategoryIds(node, true);
    renderPromptList(allPrompts.filter(p => ids.includes(p.categoryId)));
  }

  // ========== Prompt 列表渲染 ==========

  function renderPromptList(list) {
    const container = window.__pf.panelList;
    container.innerHTML = list.map(p => {
      const title = escapeHtml(p.title || '未命名');
      const desc = escapeHtml((p.description || '').substring(0, 50));
      const useCount = p.useCount || 0;
      const favIcon = p.favorite ? '★' : '☆';
      const favClass = p.favorite ? 'fav-active' : '';
      return `
        <div class="panel-item" data-id="${p.id}">
          <div class="panel-item-left">
            <div class="panel-item-title">${title}</div>
            ${desc ? `<div class="panel-item-desc">${desc}</div>` : ''}
            <div class="panel-item-meta">使用 ${useCount} 次</div>
          </div>
          <div class="panel-item-actions">
            <button class="panel-btn fav-btn ${favClass}" data-action="fav" data-id="${p.id}">${favIcon}</button>
            <button class="panel-btn copy-btn" data-action="copy" data-id="${p.id}">📋</button>
            <button class="panel-btn preview-btn" data-action="preview" data-id="${p.id}">👁</button>
          </div>
        </div>`;
    }).join('');

    // 按钮事件
    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { prompts } = await loadPrompts();
        const prompt = prompts[btn.dataset.id];
        if (prompt) await copyPrompt(prompt);
      });
    });

    container.querySelectorAll('.preview-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handlePreview(btn.dataset.id);
      });
    });

    container.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(btn.dataset.id);
        await renderCurrentTab();
      });
    });
  }

  function renderEmpty(icon, title, desc) {
    window.__pf.panelList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-desc">${desc}</div>
      </div>`;
  }

  // ========== 操作 ==========

  async function copyPrompt(prompt) {
    const ok = await copyToClipboard(prompt.content);
    if (ok) {
      await updateUseCount(prompt.id);
      showToast('已复制', 'success');
    } else {
      showToast('复制失败', 'error');
    }
  }

  async function handlePreview(promptId) {
    const { prompts } = await loadPrompts();
    const prompt = prompts[promptId];
    if (!prompt) return;

    const container = window.__pf.panelList;

    // 移除已有详情行
    const existing = container.querySelector('.panel-item-detail');
    if (existing) existing.remove();

    // 如果点的是同一个，只关闭不重新打开
    if (container._lastPreviewId === promptId) {
      container._lastPreviewId = null;
      return;
    }
    container._lastPreviewId = promptId;

    // 找到对应卡片并在下方插入详情行
    const card = container.querySelector(`.panel-item[data-id="${promptId}"]`);
    if (!card) return;

    const detail = document.createElement('div');
    detail.className = 'panel-item-detail';
    detail.innerHTML = `
      <div class="detail-content">${escapeHtml(prompt.content)}</div>
      <button class="detail-copy-btn panel-btn">📋 复制</button>
    `;
    detail.querySelector('.detail-copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyPrompt(prompt);
      detail.remove();
      container._lastPreviewId = null;
    });

    card.after(detail);
  }

  async function toggleFavorite(promptId) {
    const result = await chrome.storage.local.get('prompts');
    const prompts = result.prompts || {};
    if (prompts[promptId]) {
      prompts[promptId].favorite = !prompts[promptId].favorite;
      await chrome.storage.local.set({ prompts });
    }
  }

  // ========== Toast ==========

  let toastTimer;
  function showToast(message, type) {
    const toast = window.__pf.toast;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = 'toast toast-' + (type || 'info') + ' toast-visible';
    toastTimer = setTimeout(() => {
      toast.className = 'toast hidden';
    }, 2000);
  }

  // ========== 工具函数 ==========

  // ⚠️ 与 src/lib/utils.js 中的 buildCategoryTree 保持同步（MV3 content script 使用 IIFE 无法 import）
  function buildCategoryTree(categories) {
    if (!categories || !Array.isArray(categories)) return [];
    const map = {};
    const roots = [];
    for (const cat of categories) {
      map[cat.id] = { ...cat, children: [] };
    }
    for (const cat of Object.values(map)) {
      if (cat.parentId && map[cat.parentId]) {
        map[cat.parentId].children.push(cat);
      } else {
        roots.push(cat);
      }
    }
    // 按 order 排序
    const sortFn = (a, b) => (a.order || 0) - (b.order || 0);
    roots.sort(sortFn);
    for (const node of Object.values(map)) {
      node.children.sort(sortFn);
    }
    return roots;
  }

  function findCategoryNode(nodes, id) {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findCategoryNode(node.children, id);
      if (found) return found;
    }
    return null;
  }

  // ⚠️ 与 src/lib/utils.js 中的 flattenCategoryIds 保持同步
  function flattenCategoryIds(node, includeSelf) {
    const ids = includeSelf ? [node.id] : [];
    for (const child of (node.children || [])) {
      ids.push(...flattenCategoryIds(child, true));
    }
    return ids;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 尝试 execCommand fallback（兼容 CSP 限制的页面）
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, c => map[c]);
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  // ========== 样式 ==========

  function getStyles() {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }

      .ball-wrapper {
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
          "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        color: #111827;
        --color-primary: #4f46e5;
        --color-primary-hover: #4338ca;
        --color-primary-light: #e0e7ff;
        --color-favorite: #f59e0b;
        --color-success: #10b981;
        --color-danger: #ef4444;
        --color-warning: #f59e0b;
        --bg-primary: #ffffff;
        --bg-secondary: #f9fafb;
        --bg-tertiary: #f3f4f6;
        --bg-hover: #f0f0ff;
        --text-primary: #111827;
        --text-secondary: #6b7280;
        --text-tertiary: #9ca3af;
        --border-color: #e5e7eb;
        --radius-sm: 4px;
        --radius-md: 8px;
        --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
        --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
      }

      .float-ball {
        width: ${BALL_SIZE}px;
        height: ${BALL_SIZE}px;
        border-radius: 50%;
        background: var(--bg-primary);
        box-shadow: var(--shadow-lg);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        touch-action: none;
        transition: transform 0.2s ease;
        position: relative;
        border: 1px solid var(--border-color);
      }

      .float-ball:hover {
        transform: scale(1.08);
      }

      .float-ball:active {
        transform: scale(0.95);
      }

      .ball-icon {
        font-size: 22px;
        line-height: 1;
        pointer-events: none;
      }

      /* 迷你面板 */
      .mini-panel {
        position: fixed;
        width: ${PANEL_WIDTH}px;
        height: ${PANEL_HEIGHT}px;
        min-width: ${MIN_PANEL_WIDTH}px;
        min-height: ${MIN_PANEL_HEIGHT}px;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .mini-panel.hidden {
        display: none;
      }

      .panel-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        z-index: 10;
        background: linear-gradient(135deg, transparent 50%, #d1d5db 50%, transparent 51%, transparent 75%, #d1d5db 75%);
        border-radius: 0 0 var(--radius-md) 0;
      }

      .panel-header {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
      }

      .panel-search {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-family: inherit;
        color: var(--text-primary);
        background: var(--bg-secondary);
        outline: none;
        transition: border-color 0.15s;
      }

      .panel-search:focus {
        border-color: var(--color-primary);
      }

      .panel-search::placeholder {
        color: var(--text-tertiary);
      }

      /* Tab 栏 */
      .panel-tabs {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
        background: var(--bg-secondary);
      }

      .tab-btn {
        flex: 1;
        padding: 8px 4px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        color: var(--text-secondary);
        transition: all 0.15s;
        border-bottom: 2px solid transparent;
        white-space: nowrap;
      }

      .tab-btn:hover {
        color: var(--text-primary);
        background: var(--bg-hover);
      }

      .tab-btn.active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
        font-weight: 600;
      }

      /* 内容区 */
      .panel-content {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
      }

      .panel-list {
        padding: 0 8px;
      }

      /* 列表项 */
      .panel-item {
        display: flex;
        align-items: center;
        padding: 8px 10px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        margin-bottom: 4px;
        transition: all 0.15s;
        background: var(--bg-primary);
      }

      .panel-item:hover {
        border-color: var(--color-primary);
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }

      .panel-item-left {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      .panel-item-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .panel-item-desc {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .panel-item-meta {
        font-size: 10px;
        color: var(--text-tertiary);
        margin-top: 3px;
      }

      .panel-item-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
        margin-left: 6px;
      }

      .panel-btn {
        border: none;
        background: none;
        cursor: pointer;
        font-size: 16px;
        padding: 4px 6px;
        border-radius: 3px;
        transition: all 0.15s;
        line-height: 1;
        opacity: 0.6;
      }

      .panel-btn:hover {
        opacity: 1;
        background: var(--bg-tertiary);
      }

      .fav-btn.fav-active { opacity: 1; color: var(--color-favorite); }

      /* 预览详情行 */
      .panel-item-detail {
        margin: -2px 0 6px 0;
        padding: 10px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        border-top: none;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
      }

      .detail-content {
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-primary);
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 160px;
        overflow-y: auto;
        margin-bottom: 8px;
        padding: 8px;
        background: var(--bg-primary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
      }

      .detail-copy-btn {
        display: inline-block;
        font-size: 16px;
      }

      /* 面板底部 */
      .panel-footer {
        padding: 6px 10px;
        border-top: 1px solid var(--border-color);
        flex-shrink: 0;
      }

      .footer-btn {
        width: 100%;
        padding: 6px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        color: var(--color-primary);
        border-radius: var(--radius-sm);
        transition: background 0.15s;
      }

      .footer-btn:hover {
        background: var(--color-primary-light);
      }

      /* 空状态 */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 16px;
        text-align: center;
      }

      .empty-icon { font-size: 48px; margin-bottom: 8px; opacity: 0.5; }
      .empty-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
      .empty-desc { font-size: 12px; color: var(--text-tertiary); }

      /* 分类树 */
      .cat-all-item {
        display: flex;
        align-items: center;
        padding: 6px 12px;
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 2px;
        transition: background 0.15s;
      }
      .cat-all-item:hover { background: var(--bg-hover); }
      .cat-all-item.selected { background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; }
      .cat-item {
        display: flex;
        align-items: center;
        padding: 5px 12px;
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-size: 13px;
        transition: background 0.15s;
        user-select: none;
      }
      .cat-item:hover { background: var(--bg-hover); }
      .cat-item.selected { background: var(--color-primary-light); color: var(--color-primary); }
      .cat-toggle {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        color: var(--text-tertiary);
        flex-shrink: 0;
        margin-right: 4px;
        transition: transform 0.15s;
      }
      .cat-toggle.expanded { transform: rotate(90deg); }
      .cat-toggle.leaf { visibility: hidden; }
      .cat-icon { margin-right: 4px; font-size: 13px; flex-shrink: 0; }
      .cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cat-count { font-size: 11px; color: var(--text-tertiary); margin-left: 4px; }
      .cat-children.collapsed { display: none; }
      .cat-prompt-item {
        font-size: 12px;
        color: var(--text-secondary);
        padding: 3px 12px 3px 44px;
        cursor: pointer;
        border-radius: var(--radius-sm);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cat-prompt-item:hover {
        background: var(--bg-hover);
        color: var(--color-primary);
      }

      /* Toast */
      .toast {
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-family: inherit;
        white-space: nowrap;
        pointer-events: none;
        transition: all 0.3s ease;
      }
      .toast.hidden { opacity: 0; transform: translateX(-50%) translateY(8px); }
      .toast-visible { opacity: 1; transform: translateX(-50%) translateY(0); }
      .toast-success { background: #d1fae5; color: #065f46; }
      .toast-info { background: #dbeafe; color: #1e40af; }
      .toast-error { background: #fee2e2; color: #991b1b; }

      /* 右键菜单 */
      .context-menu {
        position: fixed;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        padding: 4px;
        z-index: 2147483647;
        min-width: 180px;
      }
      .context-menu.hidden { display: none; }
      .context-item {
        padding: 8px 12px;
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-family: inherit;
        color: var(--text-primary);
        transition: background 0.1s;
        white-space: nowrap;
      }
      .context-item:hover { background: var(--bg-hover); }

      /* 滚动条 */
      .panel-content::-webkit-scrollbar { width: 6px; }
      .panel-content::-webkit-scrollbar-track { background: transparent; }
      .panel-content::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }

      .detail-content::-webkit-scrollbar { width: 4px; }
      .detail-content::-webkit-scrollbar-track { background: transparent; }
      .detail-content::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
    `;
  }

  // ========== 启动 ==========

  init();
})();

/**
 * Service Worker — 安装初始化 + 右键菜单
 */

import { store } from '../lib/store.js';
import { cleanExpiredDrafts } from '../lib/draft.js';

const PENDING_PROMPT_EXPIRE_DAYS = 7;

// 安装/更新事件
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 初始化示例数据
    await store.initSampleData();
    console.log('Prompt 收藏夹已安装，示例数据已就绪');
  } else if (details.reason === 'update') {
    // 清理过期草稿
    const cleaned = await cleanExpiredDrafts();
    if (cleaned > 0) {
      console.log(`已清理 ${cleaned} 条过期草稿`);
    }
    // 清理过期的 pending prompt
    await cleanExpiredPendingPrompts();
  }

  // 注册右键菜单
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-as-prompt',
      title: '💾 保存选中内容为 Prompt',
      contexts: ['selection'],
    });
  });
});

// 右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-as-prompt') {
    const selectedText = info.selectionText || '';
    if (!selectedText.trim()) return;

    // 保存选中的文字为待处理队列，支持多条
    const result = await chrome.storage.local.get('_pendingPrompts');
    const pending = result._pendingPrompts || [];
    pending.push({
      content: selectedText.trim(),
      sourceUrl: tab?.url || '',
      sourceTitle: tab?.title || '',
      timestamp: new Date().toISOString(),
    });
    await chrome.storage.local.set({ _pendingPrompts: pending });

    // 打开 Popup（用户会看到预填的表单）
  }
});

// 清理过期的 pending prompt
async function cleanExpiredPendingPrompts() {
  const result = await chrome.storage.local.get('_pendingPrompts');
  const pending = result._pendingPrompts || [];
  if (pending.length === 0) return;

  const now = new Date();
  const valid = pending.filter(p => {
    const daysDiff = (now - new Date(p.timestamp)) / (1000 * 60 * 60 * 24);
    return daysDiff <= PENDING_PROMPT_EXPIRE_DAYS;
  });

  if (valid.length !== pending.length) {
    await chrome.storage.local.set({ _pendingPrompts: valid });
    console.log(`已清理 ${pending.length - valid.length} 条过期待处理 Prompt`);
  }
}

// 监听来自 Popup、Options Page 和 Content Script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 安全防护：只响应来自扩展自身的消息，拒绝外部网页的消息
  if (!sender.id || sender.id !== chrome.runtime.id) return;

  if (message.type === 'get-pending-prompt') {
    chrome.storage.local.get('_pendingPrompts', (result) => {
      const pending = result._pendingPrompts || [];
      const next = pending.shift();  // FIFO 取最早的一条
      chrome.storage.local.set({ _pendingPrompts: pending });
      sendResponse(next || null);
    });
    return true; // 异步响应
  }
  if (message.type === 'open-options') {
    // 优先复用已打开的 options page，失败则新建标签页
    chrome.runtime.openOptionsPage()
      .then(() => sendResponse({ success: true }))
      .catch(() => {
        // openOptionsPage 失败时（如 SW 上下文限制），回退到新建标签页
        chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') })
          .then(() => sendResponse({ success: true }))
          .catch((e) => sendResponse({ success: false, error: e.message }));
      });
    return true; // 异步响应
  }
});

console.log('Prompt 收藏夹 Service Worker 已启动');

// SW 启动时清理过期的 pending prompt
cleanExpiredPendingPrompts();

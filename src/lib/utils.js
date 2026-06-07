/**
 * 工具函数 — 格式化、转义、深拷贝
 */

/**
 * HTML 转义，防止 XSS
 */
export function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

/**
 * 格式化日期为可读字符串
 */
export function formatDate(isoString) {
  if (!isoString) return '从未使用';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 浅拷贝（仅用于简单对象）
 */
export function shallowCopy(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return [...obj];
  return { ...obj };
}

/**
 * 校验字符串是否为空
 */
export function isEmpty(str) {
  return !str || !str.trim();
}

/**
 * 截断文本
 */
export function truncate(str, maxLen = 100) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * 去除文件扩展名
 */
export function removeExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

/**
 * 将分类列表构建为树结构
 */
export function buildCategoryTree(categories) {
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

/**
 * 扁平化分类树（获取某节点及其所有子节点 ID）
 */
export function flattenCategoryIds(category, includeSelf = true) {
  const ids = includeSelf ? [category.id] : [];
  for (const child of (category.children || [])) {
    ids.push(...flattenCategoryIds(child, true));
  }
  return ids;
}

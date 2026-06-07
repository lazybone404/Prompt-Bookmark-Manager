/**
 * 导出逻辑 — 单个 .md / 批量 .zip
 */

/**
 * 导出单个 Prompt 为 Markdown 文件
 */
export function exportSinglePrompt(prompt) {
  let md = `# ${prompt.title}\n\n`;
  if (prompt.description) {
    md += `> ${prompt.description}\n\n`;
  }
  md += prompt.content || '';
  downloadFile(`${sanitizeFilename(prompt.title)}.md`, md);
}

/**
 * 批量导出 Prompt 为 ZIP 文件
 * @param {Array} prompts - Prompt 对象数组
 * @param {Object} categories - { [id]: CategoryObject }
 * @param {string} mode - 'all' | 'selected' | 'category' | 'favorites'
 */
export async function exportBatch(prompts, categories, mode = 'all') {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // 构建分类路径映射
  const categoryPaths = buildCategoryPaths(categories);

  for (const prompt of prompts) {
    // 确定文件路径
    const categoryPath = prompt.categoryId && categoryPaths[prompt.categoryId]
      ? categoryPaths[prompt.categoryId]
      : '';
    const dir = categoryPath ? `${categoryPath}/` : '';
    const filename = `${sanitizeFilename(prompt.title)}.md`;

    // 构建 Markdown 内容
    let content = `# ${prompt.title}\n\n`;
    if (prompt.description) content += `> ${prompt.description}\n\n`;
    content += prompt.content || '';

    zip.file(`${dir}${filename}`, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompts-export-${formatDate(new Date())}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildCategoryPaths(categories) {
  const paths = {};
  const entries = Object.values(categories);

  function getPath(id, visited = new Set()) {
    if (paths[id]) return paths[id];
    if (visited.has(id)) return '';
    visited.add(id);

    const cat = entries.find(c => c.id === id);
    if (!cat) return '';
    if (!cat.parentId) {
      paths[id] = sanitizeFilename(cat.name);
    } else {
      const parentPath = getPath(cat.parentId, visited);
      paths[id] = parentPath ? `${parentPath}/${sanitizeFilename(cat.name)}` : sanitizeFilename(cat.name);
    }
    return paths[id];
  }

  for (const cat of entries) {
    getPath(cat.id);
  }

  return paths;
}

function sanitizeFilename(name) {
  return (name || '未命名')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

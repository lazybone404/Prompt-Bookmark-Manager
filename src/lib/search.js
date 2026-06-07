/**
 * 搜索模块 — 标题 + 内容匹配
 * 搜索优先级：标题匹配 > 内容匹配
 */

/**
 * 在 Prompt 列表中搜索
 * @param {Object} prompts - { [id]: PromptObject }
 * @param {string} query - 搜索关键词
 * @returns {Array} 匹配的 Prompt 数组，先标题匹配后内容匹配
 */
export function searchPrompts(prompts, query) {
  if (!query || !query.trim()) {
    return Object.values(prompts);
  }

  const q = query.toLowerCase().trim();
  const titleMatches = [];
  const contentMatches = [];

  for (const prompt of Object.values(prompts)) {
    const title = (prompt.title || '').toLowerCase();
    const content = (prompt.content || '').toLowerCase();
    const description = (prompt.description || '').toLowerCase();

    if (title.includes(q)) {
      titleMatches.push(prompt);
    } else if (content.includes(q) || description.includes(q)) {
      contentMatches.push(prompt);
    }
  }

  // 标题匹配在前，内容匹配在后
  return [...titleMatches, ...contentMatches];
}

/**
 * 草稿管理 — 多槽位草稿系统
 */

import { store } from './store.js';

const DRAFT_EXPIRE_DAYS = 7;

/**
 * 保存草稿（编辑过程中自动调用）
 */
export async function saveDraft(promptId, data) {
  return await store.saveDraft(promptId, {
    promptId,
    title: data.title || '',
    content: data.content || '',
    description: data.description || '',
    categoryId: data.categoryId || null,
  });
}

/**
 * 获取所有草稿
 */
export async function getAllDrafts() {
  return await store.getDrafts();
}

/**
 * 获取单个草稿
 */
export async function getDraft(promptId) {
  return await store.getDraft(promptId);
}

/**
 * 删除草稿
 */
export async function removeDraft(promptId) {
  return await store.deleteDraft(promptId);
}

/**
 * 清理过期草稿（超过 DRAFT_EXPIRE_DAYS 天未修改）
 */
export async function cleanExpiredDrafts() {
  const drafts = await store.getDrafts();
  const now = new Date();
  let cleaned = 0;

  for (const [id, draft] of Object.entries(drafts)) {
    const savedAt = new Date(draft.savedAt);
    const daysDiff = (now - savedAt) / (1000 * 60 * 60 * 24);
    if (daysDiff > DRAFT_EXPIRE_DAYS) {
      await store.deleteDraft(id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * 检查是否有未保存的草稿
 */
export async function hasDrafts() {
  const drafts = await store.getDrafts();
  return Object.keys(drafts).length > 0;
}

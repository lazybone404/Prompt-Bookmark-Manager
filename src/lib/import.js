/**
 * 导入逻辑 — 单文件/文件夹/ZIP
 */

import { removeExtension } from './utils.js';
import { store } from './store.js';

/**
 * 解析文件列表（单文件/多文件拖入）
 * @param {FileList|File[]} files
 * @returns {Array<{title: string, content: string, filename: string}>}
 */
export async function parseFiles(files) {
  const results = [];
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md'].includes(ext)) continue;

    const content = await file.text();
    results.push({
      title: removeExtension(file.name),
      content,
      filename: file.name,
    });
  }
  return results;
}

/**
 * 解析文件夹入口（webkitGetAsEntry 递归）
 * @param {DataTransferItem} item
 * @returns {Array<{title: string, content: string, filename: string, categoryPath: string[]}>}
 */
export async function parseFolderEntry(item) {
  const entry = item.webkitGetAsEntry();
  if (!entry || !entry.isDirectory) return [];

  const results = [];
  await readDirectory(entry, [], results);
  return results;
}

async function readDirectory(dirEntry, path, results) {
  const reader = dirEntry.createReader();
  const entries = await readAllEntries(reader);

  for (const entry of entries) {
    if (entry.isFile) {
      const ext = entry.name.split('.').pop()?.toLowerCase();
      if (['txt', 'md'].includes(ext)) {
        const file = await getFile(entry);
        const content = await file.text();
        results.push({
          title: removeExtension(entry.name),
          content,
          filename: entry.name,
          categoryPath: [...path],
        });
      }
    } else if (entry.isDirectory) {
      await readDirectory(entry, [...path, entry.name], results);
    }
  }
}

function readAllEntries(reader) {
  return new Promise((resolve) => {
    const all = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
        } else {
          all.push(...entries);
          readBatch();
        }
      });
    };
    readBatch();
  });
}

function getFile(fileEntry) {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
}

/**
 * 解析 ZIP 文件
 * @param {File} file - .zip 文件
 * @returns {Array<{title: string, content: string, filename: string, categoryPath: string[]}>}
 */
export async function parseZipFile(file) {
  // 动态导入 JSZip
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  const results = [];
  const promises = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    const ext = relativePath.split('.').pop()?.toLowerCase();
    if (!['txt', 'md'].includes(ext)) return;

    const parts = relativePath.split('/');
    const filename = parts.pop();
    const categoryPath = parts.filter(p => p.length > 0);

    promises.push(
      zipEntry.async('text').then(content => {
        results.push({
          title: removeExtension(filename),
          content,
          filename,
          categoryPath,
          relativePath,
        });
      })
    );
  });

  await Promise.all(promises);
  return results;
}

/**
 * 预览导入：将解析结果转换为可导入的数据结构
 * 同目录层级 = 同分类
 */
export function previewImport(parsedFiles, existingCategories, existingPrompts = {}) {
  const toImport = {
    prompts: [],
    categories: [],
    duplicates: [],
    conflicts: [],
  };

  // 先处理分类结构（从文件路径推断）
  const categoryMap = {}; // pathKey -> categoryId
  for (const file of parsedFiles) {
    let currentPath = '';
    for (const segment of file.categoryPath) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (!categoryMap[currentPath]) {
        const existing = Object.values(existingCategories).find(
          c => c.name === segment && c.parentId === (categoryMap[parentPath] || null)
        );
        if (existing) {
          categoryMap[currentPath] = existing.id;
        } else {
          const id = `import_${currentPath.replace(/[^a-zA-Z0-9一-鿿]/g, '_')}`;
          categoryMap[currentPath] = id;
          toImport.categories.push({
            id,
            name: segment,
            parentId: categoryMap[parentPath] || null,
            order: 0,
          });
        }
      }
    }
  }

  // 处理 Prompt
  for (const file of parsedFiles) {
    const categoryPathKey = file.categoryPath.join('/');
    const categoryId = categoryMap[categoryPathKey] || null;
    const isDuplicate = checkDuplicate(file.title, file.content, existingPrompts);

    if (isDuplicate.exact) {
      toImport.duplicates.push({ ...file, reason: '内容完全重复' });
    } else if (isDuplicate.titleOnly) {
      toImport.conflicts.push({ ...file, reason: '标题冲突，内容不同' });
    }

    toImport.prompts.push({
      title: file.title,
      content: file.content,
      description: file.filename,
      categoryId,
    });
  }

  return toImport;
}

function checkDuplicate(title, content, existingPrompts) {
  const titleLower = (title || '').toLowerCase().trim();
  const contentLower = (content || '').toLowerCase().trim();

  for (const ep of Object.values(existingPrompts)) {
    const epTitle = (ep.title || '').toLowerCase().trim();
    const epContent = (ep.content || '').toLowerCase().trim();

    if (epTitle === titleLower && epContent === contentLower) {
      return { exact: true, titleOnly: false };
    }
    if (epTitle === titleLower && epContent !== contentLower) {
      return { exact: false, titleOnly: true };
    }
  }

  return { exact: false, titleOnly: false };
}

/**
 * 执行导入
 */
export async function executeImport(toImport) {
  return await store.importData(toImport.prompts, toImport.categories);
}

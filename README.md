# Prompt 收藏夹 (Prompt Bookmark Manager)

一个 Chrome 浏览器扩展，帮助 AI 高频用户保存、组织、搜索并快速复制常用 Prompt。

## 功能

- 📋 **Prompt 管理**：新建、编辑、删除 Prompt，支持标题、内容、描述和分类
- 📁 **分类系统**：多级树形分类，支持嵌套层级
- 🔍 **快速搜索**：标题 + 内容实时搜索，支持模糊匹配
- ⭐ **收藏**：快速标记和查看收藏的 Prompt
- 🕐 **最近使用**：自动记录使用历史，按时间和使用次数排序
- 📋 **一键复制**：点击复制 Prompt 内容到剪贴板，自动更新使用计数
- 📥 **导入**：支持 .txt、.md、文件夹拖入、.zip 文件，自动去重
- 📤 **导出**：单个/批量导出，支持 .md 和 .zip 格式
- 💾 **右键保存**：选中网页文字 → 右键菜单 → 保存为 Prompt
- ✏️ **草稿自动保存**：编辑时 500ms 防抖自动保存，重开恢复
- 🎈 **悬浮球**：在 AI 网站侧边显示悬浮球，点击打开快速访问面板，支持拖拽和临时隐藏

## 技术栈

- **平台**：Chrome Extension Manifest V3
- **UI**：Popup（快速访问 400×600px）+ Manager（完整管理后台）
- **组件**：Web Components（原生 Custom Elements + Shadow DOM）
- **样式**：CSS 自定义属性（设计令牌 `tokens.css`）
- **构建**：Vite 多入口打包
- **存储**：`chrome.storage.local`（Map-of-objects 模式，上限 5MB）
- **依赖**：JSZip（ZIP 导入导出）

## 项目结构

```
promfinder/
├── popup.html                  # Popup 入口
├── manager.html                # 管理后台入口
├── public/
│   ├── icons/                  # 扩展图标 (16/32/48/128)
│   └── manifest.json           # MV3 清单
├── src/
│   ├── popup/
│   │   ├── popup.js            # Popup 逻辑（Tab 切换、搜索、复制、预览）
│   │   └── popup.css           # Popup 样式
│   ├── manager/
│   │   ├── manager.js          # 管理后台逻辑（CRUD、排序、导入导出）
│   │   └── manager.css         # 管理后台样式
│   ├── content/
│   │   └── float-ball.js       # 悬浮球 Content Script（自包含 IIFE）
│   ├── lib/
│   │   ├── store.js            # 存储层（CRUD + EventTarget 变更通知）
│   │   ├── utils.js            # 工具函数（树构建、HTML 转义、ID 生成）
│   │   ├── search.js           # 搜索逻辑
│   │   ├── draft.js            # 草稿管理
│   │   ├── import.js           # 导入逻辑
│   │   └── export.js           # 导出逻辑
│   ├── components/             # Web Components
│   │   ├── search-bar.js       # 搜索框
│   │   ├── prompt-form.js      # Prompt 编辑器（新建/编辑/预览）
│   │   ├── prompt-card.js      # Prompt 卡片（Popup 列表项）
│   │   ├── category-tree.js    # 分类树（递归展开/折叠）
│   │   ├── toast.js            # Toast 通知
│   │   ├── confirm-dialog.js   # 确认对话框
│   │   ├── import-dialog.js    # 导入对话框
│   │   └── export-dialog.js    # 导出对话框
│   ├── styles/
│   │   └── tokens.css          # 设计令牌（CSS 自定义属性）
│   └── bg/
│       └── sw.js               # Service Worker（安装、右键菜单、消息中继）
├── scripts/
│   └── generate-icons.js       # 图标生成脚本
├── vite.config.js
└── package.json
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（Vite HMR，适合 UI 开发）
npm run dev

# 生产构建
npm run build

# 输出目录：dist/

# 在 Chrome 中加载
# 1. 打开 chrome://extensions
# 2. 开启 "开发者模式"
# 3. 点击 "加载已解压的扩展程序"
# 4. 选择 dist/ 目录
```

## 使用方式

### Popup（快速访问）

点击工具栏扩展图标打开 Popup（400×600px）。

底部 4 个 Tab：
- 🕐 **最近使用**：按最后使用时间排序，最多显示 20 条
- ⭐ **收藏**：查看所有收藏的 Prompt
- 🔍 **搜索**：实时搜索标题和内容
- 📁 **分类**：树形分类浏览，点击直接复制

卡片操作按钮：📋 复制 | 👁 预览/编辑 | ★ 收藏

### Manager（管理后台）

右键扩展图标 → "选项" 打开完整管理页。

- **左侧栏**：分类树（新建/编辑/删除分类，点击分类筛选 Prompt）
- **右侧列表**：Prompt 列表（编辑/复制/收藏/删除，支持排序切换）
- **搜索栏**：实时过滤当前列表
- **底部工具栏**：导入/导出/存储用量

### 导入格式

支持：
- 单个或批量 `.txt` 文件（文件名作为标题）
- `.md` 文件（`# 标题` 作为标题）
- `.zip` 压缩包（递归解析）
- 拖拽文件夹上传

导入时自动去重（标题 + 内容完全匹配跳过，标题冲突自动加后缀）。

### 导出格式

- `.md` 单文件（适合阅读和分享）
- `.zip` 批量导出（每个 Prompt 一个 `.md`，保留分类结构）

### 悬浮球

在支持的 AI 网站右侧自动显示浮动快捷按钮。

- **默认支持网站**：ChatGPT、Claude.ai、DeepSeek、Kimi、通义千问、文心一言、讯飞星火、Gemini、Copilot、Poe、Mistral、HuggingFace Chat、Meta AI
- **可自定义**：管理后台 → 悬浮球设置 → 添加/移除网站
- **操作**：
  - 点击悬浮球 → 打开快速访问面板（3 Tab：最近使用 / 收藏 / 搜索）
  - 拖拽悬浮球 → 调整位置
  - 点击面板外 → 关闭面板
  - 右键悬浮球 → 临时隐藏（当前网站今天不再显示）

### 右键菜单

在任意网页选中文字 → 右键 → "保存选中文字为 Prompt" → 自动打开 Popup 编辑器预填内容。

### 键盘快捷键

| 快捷键 | 作用 | 可用位置 |
|--------|------|----------|
| `Ctrl + K` | 聚焦搜索框 | Popup / Manager |
| `Ctrl + N` | 新建 Prompt | Manager |
| `Esc` | 关闭编辑器/对话框 | Popup / Manager |

## 数据存储

- 所有数据存储在 `chrome.storage.local`（浏览器本地，不上传）
- 存储上限 5MB（约 300-500 条 Prompt）
- Prompt 和分类以 `{ [id]: object }` 格式存储（非数组）
- 卸载扩展会清除所有数据，请定期导出备份

## 架构说明

### 数据流

```
chrome.storage.local
    ↕
Store (EventTarget 单例)
    ↕ dispatchEvent('change', { key })
    ├── Popup (popup.js)
    ├── Manager (manager.js)
    └── Float Ball (float-ball.js，直接读写 storage)
```

- Store 类继承 EventTarget，写操作后派发 `change` 事件
- Popup 和 Manager 监听 `change` 事件自动刷新视图
- Float Ball（Content Script）无法使用 ES module import，直接通过 `chrome.storage.local` 读写，通过 `onChanged` 监听

### 组件通信

所有 Web Components 通过 CustomEvents 通信，不通过 attributes/properties 传递复杂数据：

| 组件 | 派发事件 | 方向 |
|------|----------|------|
| `<search-bar>` | `search-input` → `{ value }` | 组件 → 页面 |
| `<prompt-editor>` | `save` / `copy` / `close` | 组件 → 页面 |
| `<category-tree>` | `select-category` / `select-prompt` / `edit-category` / `delete-category` | 组件 → 页面 |
| `<toast-message>` | 无（命令式 `.show(msg, type)`） | 页面 → 组件 |
| `<confirm-dialog>` | 无（命令式 `.show(msg, callback)`） | 页面 → 组件 |

## 许可

MIT

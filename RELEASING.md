# 发布检查

本文件供维护者打包和提交 Chrome 网上应用店时使用。用户安装及功能说明见 [README.md](README.md)。

## 发布前验证

在仓库根目录运行：

```sh
python3 -B -m unittest test_chrome_local_marks.py
node test_chrome_backup.mjs
node test_record_groups.mjs
node test_mark_styles.mjs
node test_sidepanel_background.mjs
python3 -B test_browser_interactions.py
node --check background.js
node --check backup.js
node --check record-groups.js
node --check mark-styles.js
node --check content.js
node --check popup.js
node --check sidepanel.js
```

浏览器测试使用隔离的临时 Chrome 配置和模拟存储数据，覆盖快速类型切换、默认粗细、分组、搜索、取消清空、存储失败及确认期间新增记录的保留；不读写已安装扩展的数据。默认使用 macOS Chrome 路径，其他环境可通过 `CHROME_BIN` 指定浏览器。

然后在 Chrome 中安装待发布包，手动检查网页收藏、文字书签、高亮、两种下划线、笔记、样式修改与删除、跨页面检索和跳转，以及 JSON 导出与导入。至少覆盖普通文章页和动态网页，并检查浅色与深色页面的菜单可读性。

## 打包

运行 `python3 -B package_release.py`。脚本读取 `manifest.json` 中的版本号，并通过运行时文件白名单同时生成：

- `dist/chrome-local-marks-unpacked`：Chrome 开发者模式固定加载此目录。
- `dist/chrome-local-marks-release-<版本>.zip`：用于发布，`manifest.json` 位于 ZIP 根目录。

测试文件、Git 文件和本地缓存不会进入这两个产物。不要在 Chrome 中加载源码根目录；Python 测试可能在源码目录生成 `__pycache__`，而 Chrome 禁止扩展目录包含以下划线开头的系统保留名称。`dist/` 是发布产物，不提交到源码仓库。

上架前核对 ZIP 内文件、`manifest.json` 的版本与权限，并从 `dist/chrome-local-marks-unpacked` 验收，不要直接加载源码目录。手动安装版与商店版若扩展 ID 不同，`chrome.storage.local` 不会自动迁移；先从旧版导出，再导入新版并确认记录完整。

## 隐私声明

公开[隐私政策](https://ai-notes-ecru-three.vercel.app/chrome-local-marks-privacy.html)由学习笔记网站提供，源文件为该网站仓库的 `chrome-local-marks-privacy.html`。若扩展的数据处理方式或权限发生变化，须同步检查隐私政策、商店隐私声明和 README 中的说明。

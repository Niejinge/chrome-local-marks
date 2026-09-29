# 发布检查

本文件供维护者打包和提交 Chrome 网上应用店时使用。用户安装及功能说明见 [README.md](README.md)。

## 发布前验证

在仓库根目录运行：

```sh
python3 -B -m unittest test_chrome_local_marks.py
node test_chrome_backup.mjs
node --check background.js
node --check backup.js
node --check content.js
node --check popup.js
```

然后在 Chrome 中安装待发布包，手动检查网页收藏、文字书签、高亮、两种下划线、笔记、样式修改与删除、跨页面检索和跳转，以及 JSON 导出与导入。至少覆盖普通文章页和动态网页，并检查浅色与深色页面的菜单可读性。

## 打包

运行 `python3 -B package_release.py`。脚本读取 `manifest.json` 中的版本号，只将运行时文件写入 `dist/chrome-local-marks-release-<版本>.zip`；`manifest.json` 位于 ZIP 根目录。测试文件、Git 文件和本地缓存不会进入包。`dist/` 是发布产物，不提交到源码仓库。

上架前核对 ZIP 内文件、`manifest.json` 的版本与权限，并重新安装此 ZIP 验收，不要只测试工作目录中的源码。手动安装版与商店版若扩展 ID 不同，`chrome.storage.local` 不会自动迁移；先从旧版导出，再导入新版并确认记录完整。

## 隐私声明

公开[隐私政策](https://ai-notes-ecru-three.vercel.app/chrome-local-marks-privacy.html)由学习笔记网站提供，源文件为该网站仓库的 `chrome-local-marks-privacy.html`。若扩展的数据处理方式或权限发生变化，须同步检查隐私政策、商店隐私声明和 README 中的说明。

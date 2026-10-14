# 参与贡献

欢迎反馈问题、改进交互、完善兼容性、文档和测试。使用 Node.js 22 或更新版本、Python 3.10 或更新版本；兼容目标为 Chromium 132，自动化真实扩展检查使用支持扩展调试协议的 Chrome 测试环境，360 实际安装与操作另行验证。运行时无需安装 npm 依赖。

## 提交问题

请提供扩展版本、Chrome 版本、操作系统、复现步骤、预期与实际表现。与网站有关的问题尽量提供可公开的网页地址或最小 HTML 示例。截图请隐藏个人信息；不要提交私人网页内容、完整标记备份、浏览器配置目录、令牌或密钥。

## 本地开发

1. Fork 仓库并创建独立分支。
2. 运行 `python3 -B package_release.py`。
3. 在 `chrome://extensions/` 加载 `dist/chrome-local-marks-360-unpacked`。
4. 修改源码后重新打包，在 Chrome 中重新加载扩展并刷新测试网页。

不要直接加载源码目录，测试缓存和开发文件可能导致 Chrome 拒绝加载。`dist/` 为生成文件，不提交到源码；下载包通过 Releases 分发。

## 项目结构

| 文件 | 作用 |
|---|---|
| `content.js` | 网页选区、标记恢复、工具条、笔记浮层与定位 |
| `background.js` | 后台消息、网页跳转及来源窗口上下文 |
| `record-store.js` / `store-client.js` | 记录写入队列、并发合并、撤销与容量检查 |
| `popup.html` / `popup.js` / `popup.css` | 兼容管理窗口及独立管理页列表 |
| `sidepanel.js` | 详情、笔记与样式自动保存 |
| `ui.js` / `mark-styles.js` / `record-groups.js` | 共用 UI、样式偏好及分组 |
| `backup.js` | JSON 备份校验与合并 |
| `package_release.py` | 白名单打包脚本 |
| `test_*.py` / `test_*.mjs` | 基础、存储、交互及真实扩展检查 |

## 测试

基础检查：

```sh
python3 -B -m unittest test_chrome_local_marks.py
node test_chrome_backup.mjs
node test_record_groups.mjs
node test_mark_styles.mjs
node test_sidepanel_background.mjs
node test_record_store.mjs
node test_compat_background.mjs
```

界面回归和真实扩展检查：

```sh
python3 -B package_release.py
python3 -B test_browser_interactions.py
node test_native_extension.mjs
```

脚本使用隔离的临时浏览器配置和演示数据，不访问个人 Chrome 配置。默认查找系统 Chrome，找不到时设置 `CHROME_BIN` 为浏览器可执行文件路径。真实扩展检查使用 `--enable-unsafe-extension-debugging` 在隔离浏览器中加载本地扩展，不要为日常浏览启用该参数。无桌面环境时测试以 headless 模式运行。

GitHub Actions 自动检查语法、基础与专项测试以及打包一致性。浏览器界面和真实扩展检查需在发布前本地运行。

自动生成的测试结果和截图不提交；README 使用 `docs/images/` 下的公开演示截图。手动验证普通文章、动态网页、明暗主题、中文输入、删除撤销、备份恢复和多窗口。修改写入逻辑需特别检查并发保存与失败回滚。

## Pull Request

说明具体问题、最终行为和验证结果，尽量一次解决一个主题。修复问题时增加能复现该问题的测试。不要提交生成包、私人数据或与本次改动无关的格式化。改变存储格式时说明旧数据兼容及迁移方式；改变权限或数据处理时同步更新 `PRIVACY.md`。

项目及贡献均采用 [MIT License](LICENSE)。

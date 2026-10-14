# 版本发布

插件安装说明见 [README.md](README.md)，开发与测试见 [CONTRIBUTING.md](CONTRIBUTING.md)。版本以 Git 标签和 GitHub Releases 分发，生成包不提交进 Git 源码历史。

## 发布步骤

1. 更新 `manifest.json` 版本及 `CHANGELOG.md`，执行基础、界面和真实扩展测试。
2. 运行 `python3 -B package_release.py`，从固定目录 `dist/chrome-local-marks-360-unpacked` 验证安装。
3. 核对 ZIP 根目录包含 `manifest.json`、运行文件和 `LICENSE`，不包含测试、文档、缓存、密钥或私人数据。
4. 提交并推送代码，创建对应 `v<版本>` 标签。
5. 创建 GitHub 预发布 Release，上传版本 ZIP、固定文件名 ZIP 与包含两个包的 SHA-256 校验文件。使用 `--prerelease --latest=false`，保持 Chrome 稳定版下载入口。

```sh
# 以 0.7.5 为例；后续替换为 manifest.json 中的实际版本。
cp dist/chrome-local-marks-360-preview-0.7.5.zip dist/chrome-local-marks-360-preview.zip
python3 -B -c "from pathlib import Path; import hashlib; files=[Path('dist/chrome-local-marks-360-preview-0.7.5.zip'),Path('dist/chrome-local-marks-360-preview.zip')]; Path('dist/SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in files))"
git tag v0.7.5-360-preview
git push origin v0.7.5-360-preview
gh release create v0.7.5-360-preview --verify-tag --target compat/360-chromium-132 --prerelease --latest=false --title 'v0.7.5 360 兼容预览' --notes-file .local-maintainer/release-notes.md \
  dist/chrome-local-marks-360-preview-0.7.5.zip dist/chrome-local-marks-360-preview.zip dist/SHA256SUMS.txt
```

`.local-maintainer/release-notes.md` 是本次发布准备的临时说明文件（先创建该本地目录），概述变化、安装方法与已知限制。命令中的旧标签仅为示例，已有版本不可重复发布或移动标签。

兼容包使用独立文件名并仅以 prerelease 发布，不改变 Chrome 稳定版的 `/releases/latest` 下载入口。GitHub 自动生成的源码归档不等同于可加载的插件 ZIP。

## 产物与版本边界

打包脚本采用白名单，生成固定安装目录与带版本号的 ZIP，同时附带 MIT 许可证。安装目录与 ZIP 包含相同文件。源码缓存不会进入包，`dist/`、测试结果与自动截图均被 Git 忽略。

更新已安装扩展时尽量保持加载路径不变；更换扩展 ID、浏览器配置或卸载前先导出备份。版本发布不会同步用户本地数据。

仅修改说明文档时可沿用现有应用版本，但 Release 标签必须指向实际发布的源码提交。发布前核对数据与权限说明，参见 [PRIVACY.md](PRIVACY.md)。

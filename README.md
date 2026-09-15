# 曜石 · Lithos

面向开发工程师和技术负责人的本地项目与知识工作台。支持项目资料管理、Office 阅读、知识检索与图谱、模型辅助沉淀和可选 OAuth 账号登录。

资料保存在真实目录中，离线功能无需登录。模型调用兼容 OpenAI Chat Completions；API Key 保存在当前设备。OAuth 配置使用 Windows DPAPI 加密，与模型 Key 独立。

## 从源码运行

建议 Windows 10/11、Python 3.12。安装文档提取依赖：

```powershell
python -m pip install pypdf
Copy-Item config.example.json config.json
python launcher.py
```

打开 http://127.0.0.1:8765/app 。示例配置使用项目内独立 workspace；如需现有资料，在 config.json 中指定包含 `05_项目与交付` 和 `03_技术知识库` 的根目录。先复制示例配置，避免自动发现本机已有 D 盘资料。个人配置、凭据、资料和安装包不提交到 Git。

## 验证

```powershell
python -m unittest discover -s tests -p "test_*.py"
node tests/test_storage.cjs
```

OAuth DPAPI 测试需 Windows。测试不使用真实第三方凭据。

## 打包

`python scripts/build_package.py` 构建含 Python 运行时的离线 ZIP，`python scripts/build_desktop.py` 构建 WebView2 桌面安装程序。构建脚本目前面向 Windows，并依赖仓库同级 `work/package-v2`、`work/desktop-build` 中预先准备的 Python 嵌入运行时、WebView2 SDK/离线安装程序和 Inno Setup；这些二进制不在源码仓库中。桌面构建还需要 Pillow。源码启动不依赖这些构建缓存。

macOS预览包由 `python scripts/build_mac.py` 生成，需要同级 `work/mac-build` 中的 Python Build Standalone 3.12.14（20260901）Apple Silicon和Intel运行时归档。详情见 [macOS使用说明](docs/macOS使用说明.md)。该包未签名公证、未真机验证，暂不支持OAuth配置；使用系统浏览器打开界面。

## 下载与更新

- [Release 安装包](https://github.com/TsungSEU/Lithos/releases)
- [Changelog](CHANGELOG.md)

## 文档

- [工作区使用](docs/工作区界面说明.md)
- [项目与知识沉淀](docs/使用说明.md)
- [离线部署](docs/离线使用与配置.md)
- [OAuth 配置与 Apple 回调桥接](docs/OAuth接入说明.md)

OAuth 需要自行注册供应商应用；Apple 额外需要公网 HTTPS 桥接。尚未使用真实供应商凭据完成线上联调。账号只用于当前应用会话的身份展示，不提供团队访问控制或云同步。

界面独立实现，参考 Obsidian 与 Minimal 的布局和风格。阅读依赖的版本与许可证见 [web/vendor/VERSIONS.txt](web/vendor/VERSIONS.txt)。

## 源码结构

```text
backend/   本机HTTP服务、资料处理、OAuth
web/       页面、功能脚本、样式、图标；vendor保存离线阅读依赖
desktop/   Windows桌面外壳、macOS启动器和安装定义
scripts/   构建、安装包验证和Apple回调桥接工具
tests/     后端与本地存储回归测试
docs/      使用、部署与接入说明
launcher.py  源码启动入口
```

源码按职责分层；安装包保留兼容现有启动器的运行布局，由构建脚本显式映射文件。移除了旧版未引用 style.css；Markdown渲染集中在 web/markdown.js。历史整理记录和一次性升级脚本不进入源码仓库。

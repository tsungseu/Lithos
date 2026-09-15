# Changelog

## 3.2.0 — 2026-09-15

### 新增

- 品牌更名“曜石 · Lithos”，统一紫色切面Logo、网页标题和Windows应用图标。
- Obsidian默认风格配色，Minimal式侧栏、标签页、阅读区和状态栏。
- Ctrl+O快速切换、Ctrl+P命令面板和集中设置。
- 六类沉淀目标预设、离线推荐、Tab采用建议及模型建议；保留自定义编辑并忽略过期响应。
- 可选GitHub、Google、Apple OAuth入口、浏览器绑定、一次性state、PKCE及Apple身份校验。Windows配置使用DPAPI加密。
- Apple HTTPS回调桥接示例和接入说明。
- Windows离线安装包与便携ZIP；macOS Apple Silicon/Intel独立预览启动包。

### 保留与改进

- 源码按backend/web/desktop/scripts/tests/docs分层，移除未使用的旧样式，统一Markdown渲染。
- 删除Windows重复顶部菜单；保留工作区设置、使用指南与快捷键。
- 图谱预览支持拖动分隔条、方向键调宽、保存宽度及独占阅读。
- 修复Markdown表格、列表及链接渲染，支持宽表横向滚动，并清理不安全HTML。

- 项目资料读取、Office本机预览、知识目录检索与图谱、Markdown草稿及审核入库。
- 供应商/模型ID/Effort选择与本机Key持久化。
- 原有工作区和DLP路径保持兼容；离线功能无需账号。

### 验证与限制

- Windows 71项功能测试通过；ZIP独立解压校验、离线流程、WebView2启动与退出验证通过。
- OAuth使用模拟响应验证，尚未使用真实第三方凭据完成线上联调；Apple需要自行注册应用并部署HTTPS桥接。
- macOS包仅完成静态打包校验，未真机验证、未签名公证；使用系统浏览器，暂不支持OAuth配置（待接入Keychain）。
- Windows安装程序未使用发行者代码签名。整个3.2.0 Release标记为预览，建议先在独立资料目录验证。

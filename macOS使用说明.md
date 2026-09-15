# macOS 预览包

本包为未签名、未公证、未在Mac真机运行验证的预览版。已在打包端检查文件校验和、Mach-O架构和可执行权限；不能等同于通过macOS兼容性验收。建议先使用独立测试资料。目标为macOS 14或更高版本。

- Apple Silicon（M系列）选择 aarch64；Intel选择 x86_64。
- 解压后将 Lithos.app 拖入 Applications。内置Python和阅读组件，无需另装Python。
- 双击应用，在默认浏览器打开工作台。保留“曜石正在本机运行”窗口；保存草稿后点击“退出工作台”停止服务。
- 若Gatekeeper阻止未签名应用，请先核对Release校验和，再按macOS“隐私与安全性”界面的系统提示决定是否允许此应用。不要关闭全局安全检查。
- 数据与配置位于 `~/Library/Application Support/Lithos`，移除.app不会删除资料。
- 模型Key保存在默认浏览器的本机存储中，模型提炼与离线预设可用。
- 当前OAuth配置加密使用Windows DPAPI，macOS未接入Keychain，**本预览版不支持保存OAuth应用配置和第三方账号登录**；无需登录即可使用本地功能。

本版本使用“本地应用启动器＋默认浏览器”的方式，非原生WebView桌面窗口。Apple签名公证、Keychain和真机验收属于后续事项。

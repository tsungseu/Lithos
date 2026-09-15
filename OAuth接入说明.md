# 曜石 · Lithos：账号登录

账号仅用于本次工作台应用会话的身份展示，退出或重启服务后失效。它不限制本机资料访问，不提供团队权限、资料云同步或模型订阅授权。原模型 API Key 仍独立管理。离线时所有原有本地功能继续可用。

## 使用

打开左下角“账号”或设置中的“账号”。先配置供应商应用，再点击登录并在系统浏览器完成授权。登录完成返回工作台，最多约3秒更新状态。浏览器禁止弹窗时点击“打开浏览器授权”。入口有效10分钟。

供应商凭据保存在应用配置目录 oauth-config.bin，用 Windows DPAPI 按当前账户加密；网页只显示 Client ID 和回调地址，不回显 Secret。密钥留空保留旧值。加密文件不能直接供其他 Windows 账户使用；应用开发者不应把共享的生产 Secret 分发给最终用户。

## GitHub

在 GitHub Developer settings 注册 OAuth App。Homepage 填本机地址。Authorization callback URL 使用账号页显示的完整地址，例如 http://127.0.0.1:8765/oauth/callback/github。填写该应用 Client ID 和 Client Secret。实现请求 read:user、state、PKCE，使用临时 access token 获取稳定用户 ID 后丢弃令牌。

## Google

在 Google Cloud 配置 OAuth consent screen，创建 Web application 凭据，添加账号页显示的 Authorized redirect URI，例如 http://127.0.0.1:8765/oauth/callback/google。测试应用须添加测试用户。实现使用 Authorization Code + PKCE，再向 Google 固定 userinfo 端点确认身份。Google ID Token 不作为本应用的身份来源。

## Apple

Apple 不接受本机 HTTP Return URL。需要自己的域名、Sign in with Apple Services ID、关联 App ID、Team ID 与签名私钥，并签发 client_secret JWT。将私钥留在自己的签发环境；工作台只填写已签发的 JWT，过期后更新。

1. 在自己的 HTTPS 服务器部署 oauth_apple_bridge.py，使用 TLS 反向代理将 https://你的域名/apple/callback 转发到 127.0.0.1:8790/apple/callback。反向代理关闭该路径访问日志和请求体日志，不缓存，不允许任意重定向目标。
2. LITHOS_APPLE_LOCAL_CALLBACK 环境变量指定固定工作台回调，默认 http://127.0.0.1:8765/oauth/callback/apple。安装版端口可能为8768，须与账号页一致。
3. Apple Developer 的 Return URLs 和工作台 Apple 配置均填写相同的 HTTPS 桥接地址。
4. Apple form_post 到桥接后，以303返回同一系统浏览器的本机地址。桥接只转发 code、state 或 error，不转发令牌；本机校验浏览器绑定cookie及一次性state，再直接向Apple交换授权码。
5. 本机通过Apple固定JWKS端点校验ID Token的RS256签名、issuer、audience、nonce、有效期和sub。失败不会建立账号会话。

桥接为单个固定端口设计。多用户生产分发应使用自己的统一身份后端与动态、经过验证的桌面回调协议，不在此脚本上加入任意URL转发。

## 验证与边界

测试使用模拟供应商响应验证成功、取消、state过期/重放、错误浏览器和令牌不回显。未使用真实第三方凭据完成线上联调；GitHub、Google需用户注册应用，Apple额外需要HTTPS桥接和有效JWT。未配置时按钮禁用，避免静态占位被误认为可用。

当前用户选择工作台第三方登录，因此不实现 CLI 设备码、手机号OTP、注册密码或 CodeRouterX 模型授权。后续如需 CLI，须由身份服务实现设备码签发、用户批准、轮询退避、过期及撤销，不能将本机界面的会话凭据直接当作CLI JWT。

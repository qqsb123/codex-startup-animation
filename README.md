# Codex 启动动画 · Windows 移植版

保留原项目的 12 秒动画、图片与文字设置，增加 Windows 启动入口。无需构建 Swift、安装 npm 包或修改 Codex 安装文件。它是非官方外部启动器。

## 快速使用

1. 把整个压缩包解压到一个固定文件夹，不能直接在压缩包内运行。
2. 双击 `preview.cmd`，先看动画，也可以换图片和文字。
3. 双击 `start.cmd` 启动 Codex。

需要 Windows 10/11、已安装的 Codex 桌面应用，以及 Microsoft Edge 或 Google Chrome。启动器优先使用 Codex 自带的 Node.js；没有时使用系统 Node.js 22 或更高版本。

| 入口 | 行为 |
| --- | --- |
| `start.cmd` | 同窗口入口：启动 Codex，在真实主窗口播放动画，结束后保留壁纸；首次需完全退出旧实例 |
| `start-auto.cmd` | 实验入口：未运行时先尝试同窗口接入，失败后转独立开场；已运行时直接播放独立开场 |
| `start-splash.cmd` | 始终播放独立动画窗口，并启动或激活 Codex；兼容性更高 |
| `start-integrated.cmd` | 同窗口入口；已通过同窗口方式启动的实例可重播，旧方式启动的实例需先退出 |
| `preview.cmd` | 独立预览，可以重播、拖动时间轴和修改设置，不启动 Codex |
| `verify.cmd` | 打开外部扩展验证页，测试同窗口动画、背景、设置、恢复和重播，不启动 Codex |
| `diagnose.cmd` | 显示安装路径、运行状态、Node 版本和浏览器路径，不修改应用 |

启动器不会强制结束已有的 Codex 进程。独立开场播放结束后启动或激活 Codex，独立窗口与辅助进程退出；只有同窗口接入能在 Codex 里保留壁纸。

## 图片、文字与快捷键

在动画或预览里按 **Ctrl+Alt+B** 打开设置。可更换头像、背景、标题和字幕。头像居中裁成 512×512，背景居中裁成 1536×1024 并生成轮廓；单张图片上限 30 MB。按 Esc 跳过；预览中空格暂停。

独立动画使用项目 `.windows/browser-profile/` 下的专用浏览器配置，不使用你的日常浏览器配置。独立开场与独立预览共享设置；同窗口模式的设置保存在 Codex 页面本身，和独立预览互不共享。不同项目副本也不自动共享设置。

预览资源只在本机 127.0.0.1 上提供，普通动画预览使用固定端口 18763，窗口关闭后停止；扩展验证直接打开本地文件，不使用素材端口或调试端口。端口被占用时会报错，关闭本项目已有预览再重试。自定义图片和文字不上传。进度条是动画时间进度，不是 Codex 的真实加载进度。

## 外部扩展验证页怎么打开

双击项目根目录的 `verify.cmd`。验证入口直接打开完整的本地页面，使用独立浏览器配置，不需要 Node 或本机服务器，重复打开也不会因端口冲突失败。也可以在浏览器里直接打开 `extension/preview.html`。所需的 `extension.js` 和 `controls.js` 已随包附带。

这是模拟界面：左侧菜单为示意内容。可使用右上角的「重播验证」「测试设置入口」「测试恢复外观」，以及中间的「正常页面按钮」。恢复外观后，点击「重播验证」可重新开始。验证页通过不代表真实 Codex 接入已兼容。

开发时修改动画代码或默认素材后，运行 `node tools/build-verification.mjs` 更新直接打开页面所用脚本；验证入口与直接打开 HTML 共用这些生成后的脚本。

## 桌面入口与首次启用

本机桌面原 ChatGPT 图标（实际对应 Codex）已经接到固定安装目录下的启动器。默认采用同窗口模式。**必须先完全退出当前通过旧方式启动的 Codex，再双击这个桌面图标。** 已运行实例不能补上启动时需要的本机接入端口。正常加载后，动画会覆盖真实 Codex 主窗口，结束后壁纸保留，Ctrl+Alt+B 打开图片与文字设置。

本机 Windows 商店版 26.1007.2314.0 的独立真实 Codex 实例已验证动画播放、壁纸保留、设置与重播。测试截图包含实际应用页面；模拟验证页不作为真实接入的替代证明。用户正在运行的实例保持不变，需要下次完整重启后加载。

## 同窗口接入的限制

同窗口模式使用本机 CDP 调试端口，校验可执行文件的 OpenAI 签名、端口所属进程与用户，并限制到 127.0.0.1。它需要 Codex 接受 Chromium 调试参数，并暴露原项目支持的 `app://-/index.html` 主窗口。不同 Windows 版本可能不满足这个条件。

**同窗口模式会让 Codex 的调试端口保持开启。** 关闭壁纸不会关闭端口；保存工作并完全退出 Codex，再从官方入口正常打开，才结束调试状态。同机进程可能连接该端口。独立开场不为 Codex 开启调试端口，只为项目专用预览浏览器临时开启端口。

同窗口模式的壁纸样式依赖 Codex 页面结构；应用更新、整页刷新、新窗口可能导致美化失效。其他版本仍需验证。当前移植的验证范围和结果见 `验证记录.md`。

## 路径检测与故障排查

默认检测 Windows 商店包 `OpenAI.Codex`，也识别正在运行的桌面程序与常见安装位置。只接受带有效 OpenAI 签名、旁边有 `resources/app.asar` 的桌面应用，避免把 Codex 命令行程序当成桌面程序。

有多个版本或特殊安装路径时，可在 PowerShell 里指定：

```powershell
$env:CODEX_STARTUP_EXE = 'D:\Apps\Codex\ChatGPT.exe'
$env:CODEX_STARTUP_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
& '.\start-splash.cmd'
```

可选变量：`CODEX_STARTUP_NODE` 指定 Node.js，`CODEX_STARTUP_DATA` 指定配置目录。无需管理员权限。`.cmd` 仅在本次子进程允许执行本项目脚本，不修改系统执行策略。

出现错误先运行 `diagnose.cmd`。若同窗口接入失败，请用 `start-splash.cmd`。若需要纯原版 Codex，直接从官方入口打开。

## 开发

```powershell
node --test tools/extension.test.mjs tools/windows.test.mjs
node windows/run.mjs --mode probe
node windows/run.mjs --mode preview
```

- `windows/launcher.ps1`：选择 Node 运行环境。
- `windows/system.ps1`：商店安装发现、签名和进程/端口归属校验。
- `windows/run.mjs`：Windows 启动、同窗口注入、独立开场与退出清理。
- `windows/server.mjs`：受限的本机素材服务器，支持模拟宿主测试。
- 原有 `animation.js`、`image-settings.js`、`extension/`：动画、自定义设置与外观层。
- 原始 macOS 实现保留在 `Native/`、`tools/`，原说明见 `README-macOS.md`。

不依赖第三方 npm 包。浏览器和 Node 运行时不随项目再分发。

## 素材与授权

沿用用户提供压缩包中的图片、轮廓和代码。原项目未指定代码开源许可证；角色素材和图标涉及的权利归原权利人。本次移植不代表取得这些素材的商用或再分发许可。

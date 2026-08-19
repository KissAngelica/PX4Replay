# Windows 原生编译指南

本文档适用于当前 `PX4 飞行回放 0.1.0` 工程，目标是从一台 Windows 10/11 x64 电脑生成可运行的 Tauri 桌面程序，以及 NSIS `.exe` 和 WiX `.msi` 安装包。

> 不建议在 macOS 上交叉编译 Windows 安装包。Tauri 的 WiX、NSIS、WebView2 检查以及 Windows 代码签名都应在 Windows 本机或 GitHub Actions 的 `windows-latest` runner 上执行。

## 1. 当前工程的 Windows 运行方式

前端和 Rust 桌面壳可以直接编译为 Windows 程序。ULog 解析器目前是 `tools/ulog_parser/parse_ulog.py`，通过 Python 和 `pyulog` 启动，并不是已经冻结进安装包的独立 `.exe`。

因此当前版本有两种使用方式：

1. 开发、内部测试：在工程根目录创建 `.venv`。程序会自动使用 `.venv\Scripts\python.exe`，这是本文首先采用的方式。
2. 对外发布：还需要把 Python 解析器冻结为 Tauri sidecar。第 8 节给出了做法和改造边界；未完成 sidecar 集成前，不要把安装包描述为“无需 Python 的独立发行版”。

也可以在启动程序前设置 `PX4_REPLAY_PYTHON`，显式指定已经安装 `pyulog` 的 Python：

```powershell
$env:PX4_REPLAY_PYTHON = "C:\Python312\python.exe"
```

## 2. 安装系统依赖

建议使用 Windows 11 x64；Windows 10 也可。所有命令均在 PowerShell 中执行。

### 2.1 Git 与 Node.js

安装 Git for Windows 和 Node.js LTS。建议 Node.js 22 LTS，安装后重新打开 PowerShell：

```powershell
git --version
node --version
npm --version
```

### 2.2 Visual Studio C++ Build Tools

安装 Visual Studio 2022 Build Tools。在 Visual Studio Installer 中选择：

- `Desktop development with C++`（使用 C++ 的桌面开发）
- MSVC v143 x64/x86 build tools
- Windows 10 SDK 或 Windows 11 SDK

Rust 的 `x86_64-pc-windows-msvc` 目标需要这里提供的 MSVC linker 和 Windows SDK。若之后出现 `link.exe not found`，通常就是该组件未安装完整。

### 2.3 Rust MSVC 工具链

从 [rustup.rs](https://rustup.rs/) 安装 Rust，选择默认 MSVC 工具链：

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
rustc --version
cargo --version
rustup show active-toolchain
```

最后一条应包含 `stable-x86_64-pc-windows-msvc`。

### 2.4 Python

安装 Python 3.12 x64，并勾选 `Add python.exe to PATH`。验证：

```powershell
py -3.12 --version
```

Python 只用于当前 ULog 解析器，不参与 Vue 或 Rust 的编译。

### 2.5 WebView2

Windows 11 和较新的 Windows 10 通常已安装 Microsoft Edge WebView2 Runtime。可从 Microsoft 官方页面安装 Evergreen Runtime。开发机缺少 WebView2 时，Tauri 窗口可能无法正常显示。

## 3. 获取工程并安装依赖

进入工程根目录，也就是同时包含 `package.json`、`src` 和 `src-tauri` 的目录：

```powershell
git clone <仓库地址> Ulog23D
Set-Location Ulog23D
npm ci

py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\tools\ulog_parser\requirements.txt
```

若 PowerShell 禁止执行虚拟环境激活脚本，不必修改执行策略；本文所有命令都直接调用 `.venv\Scripts\python.exe`，无需执行 `Activate.ps1`。

确认 `pyulog` 可用：

```powershell
.\.venv\Scripts\python.exe -c "from pyulog import ULog; print('pyulog OK')"
```

## 4. 编译前检查

先分别验证 TypeScript、代码规范、前端测试和解析器测试：

```powershell
npm run typecheck
npm run lint
npm test
$env:PYTHONPATH = "tools\ulog_parser"
.\.venv\Scripts\python.exe -m unittest discover -s tools\ulog_parser\tests -v
Remove-Item Env:PYTHONPATH
```

再检查 Rust：

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
```

任何一步失败都应先修复，不要直接进入安装包构建。

## 5. 运行 Windows 桌面开发版

```powershell
npm run tauri dev
```

首次运行会编译 Rust 依赖，时间会明显长于后续运行。窗口打开后至少检查：

- 内置 Mock 航迹能显示、播放、暂停和拖动时间轴。
- 暂停时可以调整模型大小，播放时尺寸滑动栏被锁定。
- 固定翼、四旋翼、直升机切换后仍保持已选模型比例。
- 使用 `OPEN LOG` 打开一份真实 `.ulg`，HUD、模型和轨迹同时出现。
- 中文目录、空格目录和较长文件名均能打开。

如果 `.ulg` 解析报“无法启动 Python”，执行：

```powershell
$env:PX4_REPLAY_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
npm run tauri dev
```

## 6. 生成 Windows 安装包

### 6.1 NSIS `.exe`

NSIS 安装器对普通用户最直观，建议作为首选发布格式：

```powershell
npm run tauri -- build --bundles nsis
```

输出目录：

```text
src-tauri\target\release\bundle\nsis\
```

文件名通常类似：

```text
PX4 飞行回放_0.1.0_x64-setup.exe
```

### 6.2 WiX `.msi`

```powershell
npm run tauri -- build --bundles msi
```

输出目录：

```text
src-tauri\target\release\bundle\msi\
```

如果 WiX 构建提示 VBScript 被禁用，在“设置 → 系统 → 可选功能”中安装或启用 `VBSCRIPT`，重启终端后再构建。

### 6.3 同时生成两种格式

```powershell
npm run tauri -- build --bundles nsis,msi
```

前端产物会先生成到 `dist`，Rust release 可执行文件位于 `src-tauri\target\release`，安装器位于上述两个 `bundle` 子目录。

## 7. 安装包验收

必须在另一台干净的 Windows 电脑或 Windows Sandbox/虚拟机上验收，不能只验证构建机上的 `.exe`。

### 当前内部测试版本

由于当前解析器仍依赖 Python，测试机需要 Python 3.12 和 `pyulog`，并在启动应用前设置：

```powershell
py -3.12 -m pip install pyulog
$env:PX4_REPLAY_PYTHON = (py -3.12 -c "import sys; print(sys.executable)")
& "C:\Program Files\PX4 飞行回放\PX4 飞行回放.exe"
```

注意：PowerShell 中的环境变量只对当前进程及其子进程有效。

验收清单：

- 安装、升级、卸载均无残留错误。
- 首次启动和二次启动均正常。
- Windows 缩放 100%、150%、200% 下界面可用。
- 普通用户权限下可打开日志，不要求管理员身份运行。
- 无 Python 的机器上 Mock 数据仍可显示；真实 ULog 应给出清晰的解析器错误，而不是白屏或崩溃。
- 有 Python/pyulog 的机器上，用实际飞行日志完整播放一次。
- 暂停后将机体最大水平尺寸设为 `0.2 米`，确认飞机移动 `1 米` 等于移动 5 个机身尺寸；继续播放时不能改变尺寸。

发布前生成 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 .\src-tauri\target\release\bundle\nsis\*.exe
Get-FileHash -Algorithm SHA256 .\src-tauri\target\release\bundle\msi\*.msi
```

## 8. 制作无需 Python 的正式发行版

正式对外分发前，建议将解析器冻结成 Tauri sidecar。此步骤需要一次小型代码改造，不能只把 `.exe` 复制进安装包，因为当前 Rust 命令启动的是 Python 脚本。

### 8.1 在 Windows 上生成解析器 `.exe`

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller
.\.venv\Scripts\pyinstaller.exe --clean --onefile --name ulog-parser .\tools\ulog_parser\parse_ulog.py

New-Item -ItemType Directory -Force .\src-tauri\binaries
Copy-Item .\dist\ulog-parser.exe .\src-tauri\binaries\ulog-parser-x86_64-pc-windows-msvc.exe
```

Tauri sidecar 必须带目标三元组后缀；Windows x64 的名字必须是：

```text
ulog-parser-x86_64-pc-windows-msvc.exe
```

### 8.2 Tauri 配置与 Rust 调用

后续集成需要完成以下改造：

1. 安装并初始化 Tauri 2 Shell plugin。
2. 在 `src-tauri/tauri.conf.json` 的 `bundle` 下加入：

   ```json
   "externalBin": ["binaries/ulog-parser"]
   ```

3. 将 `src-tauri/src/commands/ulog.rs` 从“Python + 脚本”改为 `app.shell().sidecar("ulog-parser")`，将 ULog 路径作为参数传入，并沿用当前的 stdout JSON 和 stderr 错误处理。
4. 在 Windows CI 中先执行 PyInstaller，再执行 `tauri build`，确保 sidecar 在 Tauri 打包前已经生成。
5. 在完全没有安装 Python 的干净系统中验证真实 `.ulg`。

官方参考：

- [Tauri Sidecar](https://v2.tauri.app/develop/sidecar/)
- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)

PyInstaller 单文件程序第一次启动会解压到临时目录，解析开始可能略慢；还可能触发杀毒软件误报。正式发布应对安装包和 sidecar 执行代码签名，并在干净机器上验证。

## 9. GitHub Actions 自动构建

建议在 `.github/workflows/windows-build.yml` 中使用 Windows runner。以下工作流适合手动触发并上传构建产物；它构建的是当前依赖 Python 的版本：

```yaml
name: Windows Build

on:
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - run: npm ci
      - run: python -m venv .venv
      - run: .\.venv\Scripts\python.exe -m pip install -r .\tools\ulog_parser\requirements.txt
      - run: npm run typecheck
      - run: npm test
      - run: cargo check --manifest-path .\src-tauri\Cargo.toml
      - run: npm run tauri -- build --bundles nsis,msi

      - uses: actions/upload-artifact@v4
        with:
          name: px4-flight-replay-windows-x64
          path: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/msi/*.msi
          if-no-files-found: error
```

要生成无需 Python 的版本，应在 `tauri build` 前加入第 8.1 节的 PyInstaller 和重命名命令，并先完成第 8.2 节的应用集成。

## 10. 常见故障

### `link.exe not found`

Visual Studio Build Tools 未安装 C++ 桌面工作负载，或安装后终端没有重启。补装 MSVC v143 和 Windows SDK。

### `failed to run beforeBuildCommand`

先单独执行 `npm run build` 查看 Vue/TypeScript 的真实错误；也确认已经执行 `npm ci`。

### `.msi` 构建失败但 NSIS 正常

检查 Windows 可选功能中的 VBSCRIPT，并先使用 `--bundles nsis` 生成可测试安装包。

### 打开 ULog 提示无法启动 Python

确认 `.venv\Scripts\python.exe` 存在且其中安装了 `pyulog`，或设置 `PX4_REPLAY_PYTHON`。安装包测试机不会自动拥有构建机的 `.venv`。

### 应用窗口白屏

安装/修复 WebView2 Runtime；同时打开开发模式检查前端控制台，先确认 `npm run build` 通过。

### PyInstaller sidecar 找不到

检查文件名是否包含 `-x86_64-pc-windows-msvc.exe`，路径是否为 `src-tauri\binaries`，以及它是否在执行 `tauri build` 之前生成。

## 11. 完成标准

Windows 阶段可以在以下条件全部满足后关闭：

- Windows x64 上 `typecheck`、lint、前端测试、Python 测试和 `cargo check` 全部通过。
- `tauri dev` 能打开 Mock 和真实 ULog。
- NSIS 和 MSI 均可构建、安装、升级和卸载。
- 在干净 Windows 系统完成真实 ULog 回放验收。
- 正式发行版已改用 sidecar，不要求用户安装 Python。
- 安装包完成代码签名，并记录版本号与 SHA-256。

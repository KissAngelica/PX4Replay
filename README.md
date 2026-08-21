# PX4 飞行回放

基于 Tauri 2、Vue 3、TypeScript 与 Three.js 的 PX4 ULog 3D 飞行回放工具。

当前已完成 Phase 1–12 的产品与工程主体：应用既可使用 5 分钟、30 Hz 的人工飞行数据演示，也可在 Tauri 桌面端选择或拖入 PX4 `.ulg` 日志进行解析和回放。

场景内置固定翼、四旋翼和直升机三种程序化模型，可在播放过程中即时切换。暂停回放后，可通过 `0.1–10.0 米` 滑动栏严格设置机体最大水平尺寸；Three.js 世界单位、ULog NED 位移和地面单位均按 `1 单位 = 1 米` 处理，最小网格间隔为 1 米。四旋翼使用不同的机头/机尾造型与配色，便于判断航向。

回放支持可点击/拖动的独立时间轴、事件标记、键盘控制、Seek、Stop/Replay、`0.1×–10×` 倍速、位置/速度线性插值和四元数 SLERP。轨迹使用一次性 BufferGeometry，支持完整航迹、已飞航迹、限长尾迹及 Home/起终点标记。HUD 显示位置、姿态、GPS、电池等遥测，并支持字段显隐和状态告警。

高度系统独立保留 EKF Local Z、GPS Relative Altitude、EKF Global Altitude 与用于三维显示的融合高度。默认使用 EKF 高频变化加 GPS 低频 Bias 修正，并可即时切换“融合修正 / 原始 EKF / GPS”三种高度源；GPS 丢失时保持最后 Bias，落地约束只修改融合显示高度，不覆盖原始 EKF 数据。

HUD 数据面板读取日志中真实的 ULog Topic 与字段树。展开 Topic 并勾选具体字段后，桌面端按需加载该字段的原始时间序列，并显示当前回放时刻之前的最新样本。

回放背景为程序化机场环境，包括天空、起伏地形、跑道与标线、滑行道、停机坪、直升机坪、机库、塔台、环形道路、水面、树木及识别塔等地标。

相机提供 Free、Follow、Chase 和 FPV 四种模式，可调跟随距离与延迟。Grid、世界坐标轴和机体系轴均可独立显示。HUD 以 20 Hz 更新并显示实时 FPS，Three.js 场景仍按显示刷新率直接更新。

大日志解析运行在 Tauri 后台阻塞线程池。航迹使用预分配 TypedArray 与 BufferGeometry，并已覆盖 100k/500k 点、30 分钟数据、资源释放和坐标/插值/模式解码测试。

## 开发

```bash
npm install
npm run dev
```

ULog 解析器使用 pyulog。建议在工程根目录创建虚拟环境：

```bash
python3 -m venv .venv
.venv/bin/pip install -r tools/ulog_parser/requirements-build.txt
npm run dev
```

浏览器验证可运行 `npm run build`、`npm run test` 和 `npm run lint`。安装 Rust 与 Tauri 2 的系统依赖后，可运行：

```bash
npm run tauri dev
npm run tauri build
```

桌面端开发会优先使用 `.venv/bin/python`；也可通过 `PX4_REPLAY_PYTHON` 指定已安装 pyulog 的 Python。正式安装包使用 PyInstaller 冻结并由 Tauri `externalBin` 打包的 `ulog-parser` sidecar，目标主机无需安装 Python 或 pyulog。sidecar 必须在目标平台原生构建：

```bash
python3 tools/ulog_parser/build_sidecar.py
```

文件打开支持系统选择器、拖放与最近文件列表，解析失败时会显示可读错误。

### macOS 一键构建

Finder 中双击 [macos_oneclick.command](MacOS_Build_Scripts/macos_oneclick.command)，即可依次完成依赖准备、代码检查、测试、自包含 ULog sidecar 构建以及 `.app`/DMG 打包。第一次执行需要联网下载 npm、pip 和 Cargo 依赖。

也可在终端选择构建模式：

```bash
./MacOS_Build_Scripts/macos_oneclick.command        # .app + DMG
./MacOS_Build_Scripts/macos_oneclick.command app    # 仅 .app
./MacOS_Build_Scripts/macos_oneclick.command dmg    # 仅 DMG
./MacOS_Build_Scripts/macos_oneclick.command check  # 仅检查、测试和 sidecar 自检
```

Windows 原生编译、解析器打包、安装包生成与验收步骤见 [WindowsBuild.md](Win11_Build_Scripts/WindowsBuild.md)。

## 验证

```bash
npm run typecheck
npm run lint
npm test
PYTHONPATH=tools/ulog_parser .venv/bin/python -m unittest discover -s tools/ulog_parser/tests -v
```

## 坐标约定

内部飞行数据统一使用 PX4 NED：`North / East / Down`。所有渲染坐标都通过 `CoordinateConverter` 转换为 Three.js 世界坐标：`+X East / +Y Up / +Z North`。所有飞机模型统一使用局部 `+X Right / +Y Up / +Z Forward`，禁止其他模块自行交换坐标分量。

模型会从局部中心 `(0,0,0)` 同步绘制机体系三轴：红色 `X/Right`、绿色 `Y/Up`、蓝色 `Z/Forward`。

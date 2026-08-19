# PX4 Flight Replay — TODO

> 技术栈：**Tauri 2 + Vue 3 + TypeScript + Three.js**  
> 主开发环境：**macOS**  
> 目标平台：**macOS / Windows**  
> 项目定位：**PX4 ULog 3D 飞行轨迹复现与飞行状态回放工具**  
> 第一阶段重点：**3D 轨迹 + 姿态回放 + 时间轴 + 实时 HUD/富文本信息**  
> 第二阶段重点：**ULog 深度分析、曲线、事件、EKF、控制量等分析能力**

---

# 0. 项目原则

## 0.1 第一阶段不做什么

第一阶段不要过早实现以下功能：

- 完整 uORB Topic 浏览器
- PlotJuggler 级别的任意曲线系统
- EKF 深度分析
- PID / Rate / Position Controller 分析
- Actuator 故障诊断
- 参数差异分析
- 自动生成飞行报告
- ROS2 Bag / ArduPilot BIN 等多格式支持
- 实时 MAVLink 飞行监控

这些功能统一放到 **Phase 2 / Phase 3**。

第一阶段唯一核心目标：

> 将一份 PX4 `.ulg` 日志转换成统一的 `FlightData`，然后以稳定、流畅、视觉直观的方式在 3D 场景中完整复现飞行过程。

---

# 1. 总体架构

```text
                    ┌─────────────────────┐
                    │      PX4 .ulg       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     ULog Parser     │
                    │ pyulog / Rust Parser│
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   PX4LogAdapter     │
                    │ PX4 → Normalized    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    FlightData       │
                    │ 统一内部数据模型     │
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                  ▼                         ▼
        ┌─────────────────┐       ┌─────────────────┐
        │ PlaybackEngine  │       │ Metadata / HUD  │
        │ 时间 / 插值 / Seek│       │ 状态 / 电池 / GPS │
        └────────┬────────┘       └────────┬────────┘
                 │                         │
                 └────────────┬────────────┘
                              ▼
                     ┌─────────────────┐
                     │   FlightFrame   │
                     │ 当前时刻统一状态 │
                     └────────┬────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ Three.js 3D │ │ Vue HUD/UI  │ │ Timeline UI │
        │ 飞机/轨迹/相机│ │ 实时富文本信息│ │ 播放/跳转/倍速│
        └─────────────┘ └─────────────┘ └─────────────┘
```

---

# 2. 推荐目录结构

```text
px4-flight-replay/
├── README.md
├── TODO.md
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── public/
│   ├── models/
│   │   └── uav.glb
│   └── icons/
│
├── src/
│   ├── App.vue
│   ├── main.ts
│   │
│   ├── components/
│   │   ├── FlightView.vue
│   │   ├── FlightHUD.vue
│   │   ├── PlaybackControls.vue
│   │   ├── Timeline.vue
│   │   ├── FileDropZone.vue
│   │   └── StatusBar.vue
│   │
│   ├── three/
│   │   ├── FlightScene.ts
│   │   ├── Aircraft.ts
│   │   ├── Trajectory.ts
│   │   ├── GroundGrid.ts
│   │   ├── CameraController.ts
│   │   ├── CoordinateConverter.ts
│   │   └── ThreeResourceManager.ts
│   │
│   ├── flight/
│   │   ├── types.ts
│   │   ├── FlightData.ts
│   │   ├── FlightFrame.ts
│   │   ├── FlightInterpolator.ts
│   │   ├── PlaybackController.ts
│   │   └── FlightDataValidator.ts
│   │
│   ├── px4/
│   │   ├── PX4LogAdapter.ts
│   │   ├── PX4ModeDecoder.ts
│   │   ├── PX4Quaternion.ts
│   │   └── PX4Topics.ts
│   │
│   ├── services/
│   │   ├── LogFileService.ts
│   │   └── ParserService.ts
│   │
│   ├── stores/
│   │   ├── flight.ts
│   │   └── app.ts
│   │
│   ├── composables/
│   │   ├── usePlayback.ts
│   │   └── useFlightFile.ts
│   │
│   ├── utils/
│   │   ├── math.ts
│   │   ├── time.ts
│   │   └── units.ts
│   │
│   └── styles/
│       └── main.css
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── lib.rs
│       └── commands/
│           └── file.rs
│
├── tools/
│   └── ulog_parser/
│       ├── parse_ulog.py
│       └── requirements.txt
│
├── tests/
│   ├── coordinate/
│   ├── playback/
│   └── fixtures/
│
└── .github/
    └── workflows/
        └── build.yml
```

---

# 3. 核心内部数据模型

## 3.1 FlightFrame

UI、Three.js、Timeline 不允许直接依赖 PX4 uORB Topic。

统一依赖内部结构：

```ts
export interface FlightFrame {
  timestampUs: number

  localPosition: {
    north: number
    east: number
    down: number
  }

  globalPosition?: {
    latitude: number
    longitude: number
    altitudeMsl: number
  }

  velocity: {
    north: number
    east: number
    down: number
    groundSpeed: number
  }

  attitude: {
    quaternion: {
      w: number
      x: number
      y: number
      z: number
    }

    roll: number
    pitch: number
    yaw: number
  }

  vehicle: {
    armed: boolean
    flightMode: string
  }

  battery?: {
    voltage: number
    current: number
    remaining: number
  }

  gps?: {
    satellites: number
    fixType: number
  }
}
```

---

# 4. Phase 0 — 项目初始化

## 目标

建立可以在 macOS 上正常运行的 Tauri + Vue + TypeScript 桌面程序。

## TODO

- [x] 安装 Node.js
- [ ] 安装 Rust
- [ ] 安装 Tauri 2 所需依赖
- [x] 创建 Tauri 2 + Vue 3 + TypeScript 项目
- [x] 配置 ESLint
- [x] 配置 Prettier
- [x] 配置 TypeScript strict mode
- [x] 引入 Pinia
- [x] 引入 Three.js
- [x] 引入 `@types/three`
- [x] 建立基础目录结构
- [x] 建立 Git 仓库
- [x] 创建 `.gitignore`
- [x] 添加 README
- [x] 添加 TODO.md
- [ ] 验证 `npm run tauri dev`
- [ ] 验证 macOS `.app` 构建

## 验收标准

- [ ] macOS 上可以启动桌面窗口
- [x] Vue 页面正常显示
- [x] TypeScript 无错误
- [x] Three.js 可以创建 Canvas
- [ ] `npm run tauri build` 成功

---

# 5. Phase 1 — 3D MVP

## 目标

完全不依赖 PX4 日志，先验证 3D 回放架构。

使用人工生成的 Mock FlightData 完成：

```text
模拟数据
   ↓
PlaybackController
   ↓
FlightFrame
   ↓
Three.js + HUD
```

## 5.1 Three.js 场景

- [x] 创建 `FlightScene`
- [x] 初始化 Scene
- [x] 初始化 PerspectiveCamera
- [x] 初始化 WebGLRenderer
- [x] 添加 AmbientLight
- [x] 添加 DirectionalLight
- [x] 添加 Ground Grid
- [x] 添加世界坐标轴辅助线
- [x] 支持窗口 Resize
- [x] 生命周期结束时释放 GPU Resource

## 5.2 相机

- [x] 引入 OrbitControls
- [x] 支持鼠标旋转
- [x] 支持缩放
- [x] 支持平移
- [x] 添加 Free Camera 模式
- [x] 添加 Follow Camera 模式
- [x] 添加 Reset Camera

## 5.3 无人机对象

第一版本先使用简单几何体：

- [x] 使用 Box / Cone 创建飞机占位模型
- [x] 定义模型机头方向
- [x] 支持 Position 更新
- [x] 支持 Quaternion 更新
- [x] 增加机头方向辅助箭头

第二步：

- [ ] 加载 `.glb` 模型
- [ ] 使用 GLTFLoader
- [ ] 自动调整模型缩放
- [ ] 修正模型固有坐标轴方向
- [ ] 支持模型资源释放

## 5.4 Mock FlightData

- [x] 建立测试轨迹生成器
- [x] 生成直线轨迹
- [x] 生成圆形轨迹
- [x] 生成爬升轨迹
- [x] 生成带 Roll/Pitch/Yaw 的轨迹
- [x] 生成 5 分钟以上测试数据

## 验收标准

- [x] 无人机可以沿模拟轨迹运动
- [x] Roll/Pitch/Yaw 可正确显示
- [x] 相机可自由操作
- [ ] 60 FPS 场景基本稳定
- [x] Resize 不破坏画面

---

# 6. Phase 2 — 坐标系系统

> 这是整个项目最关键的基础模块之一。

## PX4 坐标系

PX4 Local Position：

```text
NED

X = North
Y = East
Z = Down
```

Three.js 推荐：

```text
X = East
Y = Up
Z = North
```

因此位置转换：

```text
PX4 N → Three Z
PX4 E → Three X
PX4 D → Three -Y
```

## TODO

- [x] 创建 `CoordinateConverter`
- [x] 实现 NED → Three Position
- [x] 实现 Three → NED Position
- [x] 定义 Three 世界坐标轴规范
- [x] 定义无人机模型 Body Frame 规范
- [x] 实现 PX4 Quaternion → Three Quaternion
- [x] 验证 Roll 正方向
- [x] 验证 Pitch 正方向
- [x] 验证 Yaw 正方向
- [x] 测试 Yaw = 0°
- [x] 测试 Yaw = 90°
- [x] 测试 Pitch = +30°
- [x] 测试 Roll = +30°
- [x] 添加单元测试
- [x] 禁止其他模块自行处理 NED → Three 转换

## 验收标准

必须用已知姿态测试：

```text
飞机水平向北
飞机水平向东
飞机抬头
飞机低头
飞机左滚
飞机右滚
```

- [x] 所有动作在 Three.js 中方向正确
- [x] 无 Pitch / Roll 互换
- [x] 无 Yaw 反向
- [x] 无模型机头偏转 90°

---

# 7. Phase 3 — Playback Engine

## 目标

建立与渲染帧率无关的飞行回放时钟。

## PlaybackController

至少提供：

```ts
play()
pause()
stop()
seek(time)
setSpeed(speed)
update(deltaTime)
```

状态：

```ts
currentTime
duration
speed
playing
progress
```

## TODO

- [x] 创建 PlaybackController
- [x] 实现 Play
- [x] 实现 Pause
- [x] 实现 Stop
- [x] 实现 Seek
- [x] 实现 Replay
- [x] 实现倍速
- [x] 支持 0.1x
- [x] 支持 0.25x
- [x] 支持 0.5x
- [x] 支持 1x
- [x] 支持 2x
- [x] 支持 5x
- [x] 支持 10x
- [x] 播放结束自动停止
- [x] Seek 后状态立即刷新

## 插值

不同 PX4 Topic 时间戳并不一致，因此必须建立插值层。

- [x] 实现 Position Linear Interpolation
- [x] 实现 Velocity Linear Interpolation
- [x] 实现 Quaternion SLERP
- [x] 离散状态采用 Previous Sample
- [x] Flight Mode 禁止线性插值
- [x] Armed 状态禁止线性插值
- [x] GPS Fix Type 禁止线性插值

## 验收标准

- [x] 30 Hz 日志在 60 FPS 画面中无明显跳动
- [x] Quaternion 不发生突然翻转
- [x] Seek 任意位置后状态正确
- [x] 2x / 5x 不影响数据时间正确性

---

# 8. Phase 4 — 轨迹系统

## 目标

展示完整航迹和已经飞过的航迹。

## TODO

- [x] 创建 `Trajectory`
- [x] 一次性构造完整轨迹 Geometry
- [x] 不允许每个渲染帧重建 Geometry
- [x] 使用 BufferGeometry
- [x] 根据播放进度显示已飞轨迹
- [x] 支持 Full Path 显示开关
- [x] 支持 Trail Only 模式
- [x] 支持轨迹长度限制
- [x] 添加 Home Point
- [x] 添加起点标记
- [x] 添加终点标记
- [x] 添加当前飞机位置标记

## 可选

- [x] 根据高度对轨迹进行颜色映射
- [ ] 根据速度进行颜色映射
- [ ] 根据 Flight Mode 分段

## 性能目标

至少支持：

- [x] 10 分钟飞行日志
- [x] 30 分钟飞行日志
- [x] 100k trajectory points
- [x] 场景操作保持流畅

---

# 9. Phase 5 — HUD / 实时富文本

## 原则

HUD 使用 Vue HTML/CSS 实现。

不要使用 Three.js Canvas 绘制飞行状态文字。

## HUD 第一版

```text
FLIGHT

AUTO MISSION
ARMED

TIME       01:23.450

ALT        125.3 m
SPEED       18.5 m/s
V/S         -1.2 m/s

ROLL         3.2°
PITCH       -5.1°
YAW        217.4°

NORTH      123.4 m
EAST        65.3 m
DOWN       -42.2 m

GPS         18 SAT
BAT         22.4 V
```

## TODO

- [x] 创建 FlightHUD.vue
- [x] 当前时间
- [x] Flight Mode
- [x] Armed / Disarmed
- [x] Local Position
- [x] Global Position
- [x] Altitude
- [x] Ground Speed
- [x] Vertical Speed
- [x] Roll
- [x] Pitch
- [x] Yaw
- [x] GPS Satellites
- [x] GPS Fix Type
- [x] Battery Voltage
- [x] Battery Current
- [x] Battery Remaining
- [x] 单位格式化
- [x] 无数据时显示 `--`
- [x] 信息字段可配置显示/隐藏

## 状态提示

- [x] Armed 状态视觉区分
- [x] GPS 无 Fix 提示
- [x] Battery Low 提示
- [x] 日志结束提示

## 验收标准

- [x] HUD 与飞机运动时间完全同步
- [x] Seek 后 HUD 无延迟
- [x] 不因 Vue 数据更新造成明显掉帧

---

# 10. Phase 6 — Timeline / Playback UI

## UI

```text
|<   ◀   ▶/❚❚   ▶   >|

00:01:23.450
━━━━━━━━━━━━●━━━━━━━━━━━━
00:00:00             00:07:52

0.5x   1x   2x   5x
```

## TODO

- [x] PlaybackControls.vue
- [x] Timeline.vue
- [x] Play / Pause
- [x] 回到开始
- [x] Seek
- [x] 点击 Timeline 跳转
- [x] 拖动 Timeline
- [x] 倍速选择
- [x] 当前时间
- [x] 总时长
- [x] 时间格式化
- [x] Keyboard Shortcut：Space Play/Pause
- [x] ← / → 快退快进
- [x] Shift + ← / → 大步跳转

## 后续预留

Timeline 后续需要支持：

```text
Flight Mode
Armed
Failsafe
Events
Battery Warning
GPS Loss
```

因此 Timeline 数据结构不能只设计成 `<input type="range">`。

---

# 11. Phase 7 — PX4 ULog 基础解析

## 第一阶段需要的 Topic

优先：

```text
vehicle_attitude
vehicle_local_position
vehicle_global_position
vehicle_status
battery_status
vehicle_gps_position
```

可选：

```text
vehicle_land_detected
home_position
vehicle_angular_velocity
```

## 实现路线 A — 第一版推荐

```text
ULog
  ↓
pyulog
  ↓
Python Parser
  ↓
JSON / MessagePack
  ↓
Tauri frontend
```

原因：

- 快速验证产品
- pyulog 已经成熟
- 不需要第一版自己实现 ULog 二进制解析
- 后期可以替换

## TODO

- [x] 创建 `tools/ulog_parser`
- [x] 安装 pyulog
- [x] 读取 `.ulg`
- [x] 输出日志开始时间
- [x] 输出日志结束时间
- [x] 读取 vehicle_attitude
- [x] 读取 vehicle_local_position
- [x] 读取 vehicle_global_position
- [x] 读取 vehicle_status
- [x] 读取 battery_status
- [x] 读取 vehicle_gps_position
- [x] 转换成内部 FlightData
- [x] 检查 Topic 缺失
- [x] 对日志异常给出明确错误
- [x] 处理 NaN
- [x] 处理 invalid position
- [x] 处理 invalid quaternion

## 第二路线

后续视性能决定：

```text
Rust
 ↓
ULog Parser
 ↓
FlightData
```

Rust Parser 暂不作为第一阶段阻塞项。

---

# 12. Phase 8 — 文件打开流程

## 用户流程

```text
启动软件
  ↓
拖入 xxx.ulg
  ↓
Loading...
  ↓
解析
  ↓
校验
  ↓
生成 FlightData
  ↓
初始化 3D Scene
  ↓
进入 Replay
```

## TODO

- [x] 系统 File Picker
- [x] `.ulg` 文件过滤
- [x] Drag & Drop
- [x] 最近打开文件
- [x] Loading Progress
- [x] Parsing 状态
- [x] 错误提示
- [x] 日志基本信息
- [x] 文件名显示
- [x] 飞行时长显示
- [x] 日志大小显示

## 错误处理

必须处理：

- [x] 文件不存在
- [x] 文件无法读取
- [x] 非 ULog
- [x] ULog 损坏
- [x] 无 `vehicle_attitude`
- [x] 无 `vehicle_local_position`
- [x] 无有效位置
- [x] 时间戳异常

---

# 13. Phase 9 — UI 第一版

## 页面布局

```text
┌───────────────────────────────────────────────────────┐
│ PX4 Flight Replay                         flight.ulg │
├─────────────────────────────────────┬─────────────────┤
│                                     │ FLIGHT STATUS   │
│                                     │                 │
│                                     │ AUTO MISSION    │
│                                     │ ARMED           │
│                                     │                 │
│               3D VIEW               │ ALT  123.4 m    │
│                                     │ SPD   17.2 m/s  │
│                    UAV              │ VS    -0.8 m/s  │
│                   ╱                 │                 │
│               ╱────                 │ R      3.2°    │
│            ╱                        │ P     -5.1°    │
│         HOME                        │ Y    217.2°    │
│                                     │                 │
│                                     │ GPS   18 SAT    │
│                                     │ BAT   22.4 V    │
├─────────────────────────────────────┴─────────────────┤
│ ◀◀   ▶ / ❚❚   ■       ━━━━━━━━━●━━━━━━━━            │
│                       01:23 / 07:52        1.0x       │
└───────────────────────────────────────────────────────┘
```

## TODO

- [x] 顶部工具栏
- [x] 文件名
- [x] 打开文件按钮
- [x] 3D View
- [x] HUD
- [x] Timeline
- [x] Playback Controls
- [x] Camera Mode
- [x] Full Path 开关
- [x] Grid 开关
- [x] Axis 开关
- [x] Dark Theme
- [x] macOS Retina 适配
- [x] Windows DPI 适配

---

# 14. Phase 10 — Camera Modes

至少提供：

## Free

自由观察。

- [x] OrbitControls

## Follow

相机跟随无人机位置，不强制跟随姿态。

- [x] 平滑 Follow
- [x] Camera Lag

## Chase

从飞机后上方跟随。

- [x] 根据飞机 Heading 更新
- [x] Camera Offset
- [x] Camera Damping

## FPV（可选）

- [x] 相机绑定 Body Frame
- [x] 模拟飞机第一视角

---

# 15. Phase 11 — 性能优化

## 原则

Vue 不负责 60 Hz 高频渲染状态。

推荐：

```text
requestAnimationFrame
      │
      ▼
PlaybackController
      │
      ▼
Three.js direct update
```

HUD 可限制在：

```text
10~20 Hz
```

## TODO

- [x] 避免 Vue 每帧全局 reactive 更新
- [x] Three.js 使用 Object3D 直接更新
- [x] HUD 降频
- [x] 轨迹 BufferGeometry
- [x] 禁止每帧创建 Vector3
- [x] 禁止每帧重建 Material
- [x] 禁止每帧重建 Geometry
- [x] 大日志解析放后台线程/进程
- [x] 测试 100k 点
- [x] 测试 500k 点
- [x] 检查内存泄漏
- [x] Scene Dispose
- [x] Texture Dispose
- [x] Geometry Dispose
- [x] Material Dispose

## 性能目标

Mac M 系列：

- [x] 1080p ≥ 60 FPS
- [x] 100k 轨迹点保持流畅
- [x] 30 min 日志正常打开

Windows：

- [ ] 中端集显正常运行
- [ ] 1080p ≥ 30 FPS

---

# 16. Phase 12 — 工程化与测试

## 单元测试

重点测试：

- [x] NED → Three Position
- [x] Quaternion Conversion
- [x] Euler Conversion
- [x] Timestamp
- [x] Position Interpolation
- [x] Quaternion SLERP
- [x] Seek
- [x] Playback Speed
- [x] PX4 Mode Decoder

## 测试日志

保存不同类型：

```text
hover.ulg
manual.ulg
mission.ulg
high_speed.ulg
gps_loss.ulg
long_flight.ulg
```

- [x] 不提交敏感日志
- [x] 小型 Fixture 可加入 tests

---

# 17. Phase 13 — macOS / Windows 发布

## macOS

- [ ] 配置 App Name
- [ ] 配置 App Icon
- [ ] 生成 `.app`
- [ ] 生成 `.dmg`
- [ ] 测试 Apple Silicon
- [ ] 预留 Code Signing
- [ ] 预留 Notarization

## Windows

推荐：

```text
macOS 开发
    ↓
GitHub
    ↓
GitHub Actions Windows Runner
    ↓
Tauri Build
    ↓
.exe / .msi
```

- [ ] 创建 GitHub Actions
- [ ] Windows Build
- [ ] `.exe`
- [ ] `.msi`
- [ ] Windows 10 测试
- [ ] Windows 11 测试
- [ ] WebView2 检查
- [ ] Windows DPI 测试

---

# 18. Milestone 定义

## M0 — Hello Flight

完成条件：

- [ ] Tauri 启动
- [ ] Vue UI
- [ ] Three.js 场景
- [ ] 一个静态 UAV

---

## M1 — Mock Replay

完成条件：

- [ ] Mock FlightData
- [ ] UAV 沿轨迹运动
- [ ] 姿态变化
- [ ] Play/Pause
- [ ] Timeline
- [ ] HUD

此时软件已经具备基本产品形态。

---

## M2 — Real PX4 Replay

完成条件：

- [ ] 打开 `.ulg`
- [ ] pyulog 解析
- [ ] FlightData
- [ ] PX4 坐标转换
- [ ] 真实航迹
- [ ] 真实姿态
- [ ] 真实 HUD

达到第一阶段核心目标。

---

## M3 — Usable Desktop App

完成条件：

- [ ] 文件拖拽
- [ ] 相机模式
- [ ] 倍速
- [ ] Seek
- [ ] Full Trail
- [ ] UI 完整
- [ ] 错误处理
- [ ] 性能优化
- [ ] macOS build
- [ ] Windows build

此版本可以定义为：

```text
v0.1.0
```

---

# 19. Phase 2 — 日志分析功能

> 只有 v0.1.0 的 3D Replay 稳定后再开始。

## 19.1 通用曲线系统

- [ ] Plot Panel
- [ ] 多曲线
- [ ] X Axis 使用 Flight Time
- [ ] Zoom
- [ ] Pan
- [ ] Cursor
- [ ] Cursor 与 3D Replay 同步
- [ ] Topic Selector
- [ ] Field Selector

候选库：

```text
Apache ECharts
uPlot
Plotly.js
```

优先考虑：

```text
uPlot
```

因为时间序列性能较好。

---

## 19.2 PX4 Topic Browser

- [ ] Topic 列表
- [ ] Instance
- [ ] Field
- [ ] Frequency
- [ ] Min / Max
- [ ] Raw Data

---

## 19.3 飞行模式 Timeline

- [ ] Manual
- [ ] Stabilized
- [ ] Position
- [ ] Mission
- [ ] RTL
- [ ] Land
- [ ] Offboard

不同 Flight Mode 作为 Timeline Segment。

---

## 19.4 Event Timeline

- [ ] Armed
- [ ] Disarmed
- [ ] Failsafe
- [ ] GPS Loss
- [ ] Battery Warning
- [ ] EKF Warning
- [ ] Mission State
- [ ] Landed

---

## 19.5 Setpoint vs Actual

### Position

```text
vehicle_local_position
trajectory_setpoint
```

- [ ] X
- [ ] Y
- [ ] Z

### Attitude

```text
vehicle_attitude
vehicle_attitude_setpoint
```

- [ ] Roll
- [ ] Pitch
- [ ] Yaw

### Rate

```text
vehicle_angular_velocity
vehicle_rates_setpoint
```

- [ ] Roll Rate
- [ ] Pitch Rate
- [ ] Yaw Rate

---

## 19.6 Actuator / ESC

- [ ] actuator_motors
- [ ] actuator_outputs
- [ ] esc_status
- [ ] RPM
- [ ] Current
- [ ] ESC Temperature

可进一步将 ESC RPM 映射到 3D 螺旋桨动画。

---

## 19.7 EKF 分析

- [ ] estimator_status
- [ ] estimator_status_flags
- [ ] innovation
- [ ] innovation variance
- [ ] GPS checks
- [ ] Magnetometer checks
- [ ] Height source
- [ ] Velocity source

---

# 20. Phase 3 — 高级功能

## 地图模式

加入：

```text
CesiumJS
```

形成：

```text
[ LOCAL 3D ] [ GLOBAL MAP ]
```

Local：

```text
Three.js
NED
```

Global：

```text
CesiumJS
WGS84
```

TODO：

- [ ] 经纬度航迹
- [ ] Satellite Map
- [ ] Terrain
- [ ] Home
- [ ] Waypoint
- [ ] Global UAV Position

---

## 实时 MAVLink

最终形成：

```text
ULog Replay
+
Live Flight
```

TODO：

- [ ] UDP MAVLink
- [ ] Serial MAVLink
- [ ] HEARTBEAT
- [ ] ATTITUDE
- [ ] GLOBAL_POSITION_INT
- [ ] LOCAL_POSITION_NED
- [ ] SYS_STATUS
- [ ] GPS_RAW_INT
- [ ] BATTERY_STATUS

统一转换为：

```text
FlightFrame
```

3D 层完全不需要修改。

---

# 21. 关键架构约束

以下内容从项目开始就必须遵守。

## Rule 1

Three.js 不得直接读取 PX4 Topic。

错误：

```text
vehicle_attitude → Three.js
```

正确：

```text
vehicle_attitude
      ↓
PX4LogAdapter
      ↓
FlightFrame
      ↓
Three.js
```

---

## Rule 2

所有坐标转换只允许出现在：

```text
CoordinateConverter
```

禁止散落：

```text
-threeZ
swapXY
yaw += 90
```

这样的补丁。

---

## Rule 3

Playback Time 是整个系统唯一时间源。

```text
PlaybackController.currentTime
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
      UAV      HUD       Plot
```

禁止各组件自己维护时间。

---

## Rule 4

3D 渲染循环与 Vue UI 更新频率解耦。

推荐：

```text
Three.js = requestAnimationFrame / 60 Hz

HUD      = 10~20 Hz

Plot     = 按需
```

---

## Rule 5

第一阶段优先保证正确性，不优先追求 ULog Parser 的纯 Rust 实现。

先：

```text
pyulog
```

后：

```text
Rust Parser
```

---

# 22. 推荐开发顺序

严格建议按以下顺序开发：

```text
01 Project Bootstrap
       ↓
02 Three.js Scene
       ↓
03 Mock UAV
       ↓
04 Coordinate System
       ↓
05 Mock FlightData
       ↓
06 PlaybackController
       ↓
07 Interpolator
       ↓
08 UAV Replay
       ↓
09 Trajectory
       ↓
10 HUD
       ↓
11 Timeline
       ↓
12 ULog Parser
       ↓
13 PX4LogAdapter
       ↓
14 Real Flight Replay
       ↓
15 Camera Modes
       ↓
16 Performance
       ↓
17 Desktop UX
       ↓
18 macOS Build
       ↓
19 Windows CI Build
       ↓
20 v0.1.0
```

**不要先写 ULog Parser。**

先确保 Mock 数据可以完整驱动：

```text
Playback → 3D → HUD → Timeline
```

随后接入真实 ULog 只是替换数据源。

---

# 23. v0.1.0 Definition of Done

当以下全部完成，可以发布第一版：

- [ ] macOS 可安装运行
- [ ] Windows 可安装运行
- [ ] 支持打开 PX4 `.ulg`
- [ ] 支持拖拽 `.ulg`
- [ ] 正确解析基本飞行数据
- [ ] 3D 显示完整飞行轨迹
- [ ] UAV 沿轨迹移动
- [ ] Roll / Pitch / Yaw 正确
- [ ] Play
- [ ] Pause
- [ ] Seek
- [ ] 0.5x / 1x / 2x / 5x
- [ ] HUD 实时状态
- [ ] 自由相机
- [ ] Follow Camera
- [ ] 30 分钟日志正常使用
- [ ] 无明显内存泄漏
- [ ] 异常日志不会导致应用崩溃

---

# 24. v0.2.0 目标

```text
Flight Replay
+
Basic Log Analysis
```

- [ ] 通用 Plot
- [ ] Topic Browser
- [ ] Flight Mode Timeline
- [ ] Event Timeline
- [ ] Setpoint vs Actual
- [ ] Actuator
- [ ] ESC
- [ ] Basic EKF

---

# 25. v0.3.0 目标

```text
Flight Replay
+
Log Analysis
+
Global Map
```

- [ ] CesiumJS
- [ ] WGS84 Track
- [ ] Terrain
- [ ] Satellite Map
- [ ] Waypoints

---

# 26. 长期目标

最终可以扩展为：

```text
PX4 Flight Studio

├── ULog Replay
├── 3D Flight Viewer
├── Global Map
├── Flight Plot
├── PX4 Topic Browser
├── EKF Analysis
├── Controller Analysis
├── ESC Analysis
├── Event Timeline
├── MAVLink Live View
├── Mission View
└── Report Export
```

核心架构仍保持：

```text
Data Source
    │
    ▼
Adapter
    │
    ▼
FlightData / FlightFrame
    │
    ├── Replay
    ├── 3D
    ├── HUD
    ├── Plot
    └── Analysis
```

---

# 27. 当前立即执行的 Sprint

建议第一个 Sprint 只完成以下内容：

- [ ] 创建 Tauri 2 + Vue 3 + TypeScript 项目
- [ ] 安装 Three.js
- [ ] 创建 `FlightView.vue`
- [ ] 创建 `FlightScene.ts`
- [ ] 建立 PerspectiveCamera
- [ ] 建立 OrbitControls
- [ ] 建立 Grid
- [ ] 添加测试 UAV
- [ ] 创建 Mock FlightData
- [ ] 创建 PlaybackController
- [ ] 让 UAV 沿 Mock 轨迹移动
- [ ] 加入 Play / Pause
- [ ] 加入基础 HUD

Sprint 验收：

> 打开应用后点击 Play，可以看到一架模拟无人机沿三维轨迹运动，同时右侧 Roll / Pitch / Yaw / Position 随时间实时变化。

在这一 Sprint 完成前，**不要开始 ULog 解析**。

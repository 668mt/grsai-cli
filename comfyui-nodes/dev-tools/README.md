# Mock `grsai` CLI —— ComfyUI 节点开发工具

## 🎯 用途

调试 ComfyUI 节点时，**避免消耗 grsai API 配额**。

这个 mock `grsai.cmd` 完整模拟 CLI 的输出格式（submit + poll + JSON），但不调用 grsai 平台，返回一张 1x1 像素的本地 PNG。

## 🚀 快速开始

### 1. 备份真 CLI

```powershell
copy D:\npm\grsai.cmd D:\npm\grsai.cmd.real
```

### 2. 用 mock 替换

```powershell
copy D:\work\idea_workspace\grsai-cli\comfyui-nodes\dev-tools\mock-grsai.cmd D:\npm\grsai.cmd
```

### 3. 启动 ComfyUI，跑节点

```powershell
cd D:\work\idea_workspace\ComfyUI
.\.venv\Scripts\python.exe main.py
```

打开任意带 `GrsaiBanana` / `GrsaiGptImage` / `GrsaiMinimaxH3` 的 workflow，**Queue Prompt**。节点会跑 mock CLI，不消耗真实配额。

### 4. 测完恢复真 CLI

```powershell
copy D:\npm\grsai.cmd.real D:\npm\grsai.cmd
del D:\npm\grsai.cmd.real
```

## 🎚️ Mock 模式（环境变量）

```powershell
# 快速跑完（默认，约 5 秒）
$env:GRSAI_MOCK_MODE = "fast"
grsai banana -p "test" --json

# 慢速跑（~80 秒，触发 2 次心跳推送）
$env:GRSAI_MOCK_MODE = "slow"
grsai banana -p "test" --json --max-wait 300

# 一直轮询（测试超时，max-wait 控制何时结束）
$env:GRSAI_MOCK_MODE = "hang"
grsai banana -p "test" --json --max-wait 10

# 模拟业务错误（节点会捕获 success=false）
$env:GRSAI_MOCK_MODE = "error"
grsai banana -p "test" --json
```

## 📋 Mock 输出格式

**stdout**（节点解析的 JSON）：
```json
{"success":true,"command":"banana","results":[{"path":"C:\\...\\banana_1234.png","durationMs":1200}],"totalDurationMs":1200,"count":1}
```

**stderr**（节点实时推送到 ComfyUI UI 的进度）：
```
➜ 任务已提交：mock-task-id-abcd1234
ℹ [mock] 进度更新 0% → 5%
ℹ [mock] 轮询中 · 已等待 30s · 进度 5%
✔ [mock banana] C:\...\banana_1234.png  (1.2s)
```

**生成的文件**：1x1 像素的 PNG（67 字节，节点可以正常读 + 转 tensor）。

## ⚠️ 注意事项

- **不影响生产环境**：通过 mock 替换 D:\npm\grsai.cmd 实现，要小心别忘了恢复
- **也可以临时改 PATH**：把 mock 所在目录加到 PATH 最前面，会优先调用 mock（不需要覆盖真文件）
- **支持所有子命令**：`banana` / `gpt` / `minimax-h3` 都识别，其他子命令会直接退出
- **不支持真实 AI 生成**：节点代码里如果直接调 API（不应该），mock 不会拦截
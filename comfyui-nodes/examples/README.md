# ComfyUI Workflow 示例

把 `.json` 文件**直接拖到 ComfyUI 画布**上即可加载。

## 📋 模板清单

| 文件 | 用途 | 依赖 |
|------|------|------|
| `01-banana-minimal.json` | 单图生成 + UI 预览 | 内建节点 |
| `02-banana-multiref-save.json` | 多参考图 + 保存到 output/ | 内建节点 |
| `03-minimax-h3-video.json` | 视频生成 + 首帧预览 + 视频处理 | **需装 VideoHelperSuite 插件** |
| `04-prompt-from-text-node.json` | prompt 从 `PrimitiveString` 文本节点输入 | 内建节点 |
| `05-prompt-from-llm-node.json` | prompt 从多个文本节点拼接（演示动态构造）| `TextConcatenate` 节点（comfyui-tooling 内置）|

## 🚀 使用步骤

1. **配置 API Key**（一次性）：
   ```bash
   # 推荐：用 CLI 统一配置
   grsai config set --api-key sk-你的key
   ```

2. **打开 ComfyUI**（`http://127.0.0.1:8188`）

3. **拖入 workflow**：
   - 把 `01-banana-minimal.json` 拖到画布
   - 右键 `GrsaiBanana` 节点 → 修改 `prompt`
   - 点 **Queue Prompt** 或 `Ctrl+Enter` 执行

5. **结果查看**：
   - 模板 1/2/3：`PreviewImage` / `SaveImage` 节点上直接看
   - 模板 3 视频：`video_path` 输出到 `<ComfyUI>/output/grsai-minimax-h3-<ts>_0.mp4`

## 🧩 模板 3（视频）的特殊处理

### VHS_LoadVideo 节点

模板 3 里 `VHS_LoadVideo` 的 `video` 字段填了占位符 `<GRSAI_MINIMAX_H3_OUTPUT_PATH>`。

**加载后手动操作**：
1. 跑一次 `GrsaiMinimaxH3` 后，看 ComfyUI 控制台会打印 `视频已保存：<path>`
2. 或者看 `<ComfyUI>/output/grsai-minimax-h3-<时间戳>_0.mp4`
3. 复制路径到 `VHS_LoadVideo` 的 `video` 字段

**或者**：直接把 `video_path` 字符串连到 `VHS_VideoCombine` 的 `filename_prefix`，让 `VHS_VideoCombine` 把视频复制到自己的输出位置。

### 简化版（只用 VHS_VideoCombine）

如果不需要二次处理视频，可以直接把 `video_path` 字符串连到 `VHS_VideoCombine`：

```
GrsaiMinimaxH3
├─ preview_frame ─▶ PreviewImage
└─ video_path    ─▶ VHS_VideoCombine
                  └─ frames 输入留空
                  └─ filename_prefix: "grsai_"
                  └─ save_output: true
                  └─ format: "video/h264-mp4"
```

`VHS_VideoCombine` 会把视频按 frame 重新编码保存（稍慢但格式统一）。

## 🔄 调整参数

| 想要的效果 | 改哪个参数 |
|-----------|----------------|
| 改提示词 | 节点的 `prompt` 字段 |
| 换模型版本 | `model` COMBO（banana / gpt） |
| 换图片比例 | `ratio` COMBO |
| 加快 / 慢速 | `size` COMBO（1K 最快 / 4K 最慢）|
| 一次多张 | `count` INT（1~5）|
| 加超时 | `max_wait` INT（秒，默认 600） |
| 加参考图 | 连到 `image1` ~ `image5`（banana/gpt）/ `image1` ~ `image9`（minimax-h3）|

## ⚠️ 注意事项

- **拖入 workflow 后**：所有节点 ID 会被 ComfyUI 自动重新分配，链接关系会自动重建
- **保存的 workflow 会包含敏感信息吗**？—— 节点 input 框里**没有** API Key（我们已删除），分享 workflow 安全
- **第一次跑会比较慢**：需要从 grsai 平台下载模型或排队等待
- **minimax-h3 通常需要 1~5 分钟**：`max_wait` 默认 900s 够用
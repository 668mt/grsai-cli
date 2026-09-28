import { useEffect, useMemo, useState } from 'react';
import { HistoryList } from './components/HistoryList';
import { OptimizeAlternatives } from './components/OptimizeAlternatives';
import { ReferenceUpload } from './components/ReferenceUpload';
import { ResultPanel } from './components/ResultPanel';
import { api } from './services/api';
import type {
  BackendId,
  BackendInfo,
  GenerateRequest,
  GenerateResponse,
  HistoryItem,
  Reference,
} from './types';

const FALLBACK_BACKENDS: BackendInfo[] = [
  {
    id: 'banana',
    displayName: 'nano-banana (grsai)',
    kind: 'image',
    models: [
      { id: 'nano-banana-2', label: 'nano-banana-2 (默认)' },
      { id: 'nano-banana-fast', label: 'nano-banana-fast' },
      { id: 'nano-banana-pro', label: 'nano-banana-pro' },
    ],
    options: [
      {
        key: 'ratio',
        label: '宽高比',
        type: 'select',
        choices: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'auto'],
        default: '1:1',
      },
      {
        key: 'size',
        label: '分辨率',
        type: 'select',
        choices: ['1K', '2K', '4K'],
        default: '1K',
      },
    ],
  },
  {
    id: 'gpt-image',
    displayName: 'gpt-image-2 / 2.5 (grsai)',
    kind: 'image',
    models: [
      { id: 'gpt-image-2', label: 'gpt-image-2 (默认)' },
      { id: 'gpt-image-2.5', label: 'gpt-image-2.5' },
      { id: 'gpt-image-2-vip', label: 'gpt-image-2-vip' },
    ],
    options: [
      {
        key: 'ratio',
        label: '比例 / 像素',
        type: 'select',
        choices: ['1024x1024', '1536x1024', '1024x1536', '1:1', '16:9', '9:16'],
        default: '1024x1024',
      },
      {
        key: 'quality',
        label: '质量',
        type: 'select',
        choices: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
        default: 'auto',
      },
    ],
  },
  {
    id: 'minimax-h3',
    displayName: 'minimax-h3 视频 (grsai)',
    kind: 'video',
    models: [{ id: 'minimax-h3', label: 'minimax-h3' }],
    options: [
      {
        key: 'ratio',
        label: '画幅',
        type: 'select',
        choices: ['portrait', 'landscape'],
        default: 'portrait',
      },
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        choices: ['480p', '768p', '1080p'],
        default: '768p',
      },
      {
        key: 'duration',
        label: '时长 (秒)',
        type: 'number',
        min: 1,
        max: 15,
        default: '6',
      },
    ],
  },
];

export default function App() {
  const [backends, setBackends] = useState<BackendInfo[]>(FALLBACK_BACKENDS);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [backendId, setBackendId] = useState<BackendId>('banana');
  const [model, setModel] = useState('nano-banana-2');
  const [options, setOptions] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<Reference[]>([]);
  const [optimizing, setOptimizing] = useState(false);
const [altVariants, setAltVariants] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // 加载后端列表
  useEffect(() => {
    api
      .info()
      .then(info => {
        if (info.backends?.length) setBackends(info.backends);
        setLlmConfigured(info.llmConfigured);
      })
      .catch(() => {});
  }, []);

  // 当前 backend + 默认选项
  const currentBackend = useMemo(
    () => backends.find(b => b.id === backendId) ?? FALLBACK_BACKENDS[0]!,
    [backends, backendId],
  );

  useEffect(() => {
    // 切换后端时重置 model 和 options
    const firstModel = currentBackend.models[0]?.id ?? '';
    setModel(firstModel);
    const defaults: Record<string, string> = {};
    for (const opt of currentBackend.options) {
      if (opt.default !== undefined) defaults[opt.key] = opt.default;
    }
    setOptions(defaults);
  }, [currentBackend]);

  const updateOption = (key: string, value: string) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  /** agent 优化提示词 - 弹出 3 个候选让用户选 */
  const handleOptimize = async () => {
    if (!prompt.trim() || optimizing) return;
    setOptimizing(true);
    setError(undefined);
    try {
      const resp = await api.optimize({
        prompt,
        backend: backendId,
        model,
        ratio: options.ratio,
        size: options.size,
        quality: options.quality,
        duration: options.duration ? Number(options.duration) : undefined,
        resolution: options.resolution,
      });
      setAltVariants(resp.variants);
    } catch (e) {
      setError(`优化失败：${(e as Error).message}`);
    } finally {
      setOptimizing(false);
    }
  };

  /** 用户从候选里选了一个 */
  const handlePickVariant = (picked: string) => {
    setPrompt(picked);
    setAltVariants(null);
  };

  /** 提交生成 */
  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setResult(null);
    setError(undefined);
    setProgress(undefined);

    const req: GenerateRequest = {
      backend: backendId,
      prompt,
      model,
      ratio: options.ratio,
      size: options.size,
      quality: options.quality,
      resolution: options.resolution,
      duration: options.duration ? Number(options.duration) : undefined,
      // 发给后端的是 dataUrl（grsai 在云端访问不到 localhost）
      images: references.map(r => r.dataUrl),
    };

    try {
      const resp = await api.generate(req);
      setResult(resp);
      if (resp.status === 'succeeded' && resp.results[0]) {
        const item: Omit<HistoryItem, 'id' | 'createdAt'> = {
          prompt,
          backend: backendId,
          model,
          ratio: options.ratio,
          url: resp.results[0].url,
          mimeType: resp.results[0].mimeType,
          durationMs: resp.durationMs,
        };
        api.saveHistory(item).catch((e) => {
          setError(`保存历史失败：${(e as Error).message}`);
        });
        setHistoryRefresh(v => v + 1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
      setProgress(undefined);
    }
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setPrompt(item.prompt);
    setBackendId(item.backend);
    if (item.model) setModel(item.model);
    if (item.ratio) setOptions(prev => ({ ...prev, ratio: item.ratio! }));
  };

  return (
    <div className="app">
      <HistoryList
        refreshKey={historyRefresh}
        onSelect={handleSelectHistory}
        onChanged={() => setHistoryRefresh(v => v + 1)}
      />

      <div className="main">
        <div className="main-header">
          <div>
            <h1>🎨 grsai web</h1>
            <div className="subtitle">
              {llmConfigured
                ? '✦ agent 优化已启用'
                : '⚠ agent 未配置（运行 `grsai config set --llm-api-key <KEY>` 启用）'}
            </div>
          </div>
        </div>

        <div className="main-body">
          <div className="inputs">
            {/* 后端选择 */}
            <div className="field">
              <label>后端</label>
              <select
                value={backendId}
                onChange={e => setBackendId(e.target.value as BackendId)}
              >
                {backends.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* 模型选择 */}
            <div className="field">
              <label>模型</label>
              <select value={model} onChange={e => setModel(e.target.value)}>
                {currentBackend.models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 通用选项 */}
            <div className="row">
              {currentBackend.options.map(opt => (
                <div className="field" key={opt.key}>
                  <label>{opt.label}</label>
                  {opt.type === 'select' ? (
                    <select
                      value={options[opt.key] ?? opt.default ?? ''}
                      onChange={e => updateOption(opt.key, e.target.value)}
                    >
                      {(opt.choices ?? []).map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={opt.min}
                      max={opt.max}
                      value={options[opt.key] ?? opt.default ?? ''}
                      onChange={e => updateOption(opt.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 参考图上传（仅图片类后端） */}
            {(backendId === 'banana' || backendId === 'gpt-image') && (
              <ReferenceUpload
                references={references}
                onChange={setReferences}
                disabled={generating}
              />
            )}

            {/* 提示词 + agent 优化 */}
            <div className="field">
              <label>提示词</label>
              <div className="prompt-area">
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="描述你想生成的图片或视频..."
                />
                <button
                  className="optimize-btn"
                  onClick={handleOptimize}
                  disabled={!prompt.trim() || optimizing}
                  title={llmConfigured ? 'AI 优化提示词' : '需先配置 LLM API Key'}
                >
                  {optimizing ? '优化中…' : '✨ 优化'}
                </button>
              </div>
            </div>

            {/* 生成按钮 */}
            <button
              className="generate-btn"
              onClick={handleGenerate}
              disabled={!prompt.trim() || generating}
            >
              {generating ? '生成中…' : '🎨 生成'}
            </button>

            {error && <div className="error">{error}</div>}
          </div>

          <ResultPanel
            loading={generating}
            progress={progress}
            result={result}
            error={error}
          />
        </div>

        {/* 优化提示词候选弹层 */}
        {altVariants && (
          <OptimizeAlternatives
            variants={altVariants}
            originalPrompt={prompt}
            onPick={handlePickVariant}
            onCancel={() => setAltVariants(null)}
          />
        )}
      </div>
    </div>
  );
}
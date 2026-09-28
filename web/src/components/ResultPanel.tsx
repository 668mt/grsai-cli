import type { GenerateResponse, HistoryItem } from '../types';

interface Props {
  loading: boolean;
  progress?: number;
  result: GenerateResponse | null;
  error?: string;
  onSaveToHistory?: (item: Omit<HistoryItem, 'id' | 'createdAt'>) => void;
}

export function ResultPanel({ loading, progress, result, error }: Props) {
  if (error) {
    return (
      <div className="result">
        <div className="result-empty">
          <div className="icon">⚠️</div>
          <div style={{ color: 'var(--danger)', maxWidth: 400, textAlign: 'center' }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="result">
        <div className="result-loading">
          <div className="spinner" />
          <div className="progress-text">
            生成中… {progress !== undefined ? `进度 ${progress}%` : ''}
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="result">
        <div className="result-empty">
          <div className="icon">🎨</div>
          <div>填写提示词，点"生成"</div>
        </div>
      </div>
    );
  }

  if (result.status !== 'succeeded' || result.results.length === 0) {
    return (
      <div className="result">
        <div className="result-empty">
          <div className="icon">😢</div>
          <div style={{ color: 'var(--danger)' }}>
            生成失败：{result.error ?? result.status}
          </div>
        </div>
      </div>
    );
  }

  const item = result.results[0]!;
  const isVideo = (item.mimeType ?? '').startsWith('video/');

  return (
    <div className="result">
      <div className="result-media">
        {isVideo ? (
          <video src={item.url} controls autoPlay loop muted />
        ) : (
          <img src={item.url} alt={result.taskId} />
        )}
        <div className="result-info">
          <span>
            {result.results.length} 个结果 · 耗时 {(result.durationMs / 1000).toFixed(1)}s
          </span>
          <a href={item.url} target="_blank" rel="noreferrer">
            打开原图 ↗
          </a>
        </div>
      </div>
    </div>
  );
}
import { useState } from 'react';
import { api } from '../services/api';
import type { Reference } from '../types';

interface Props {
  references: Reference[];
  onChange: (refs: Reference[]) => void;
  disabled?: boolean;
  maxCount?: number;
}

export function ReferenceUpload({ references, onChange, disabled, maxCount = 8 }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (references.length + files.length > maxCount) {
      setError(`最多上传 ${maxCount} 张参考图`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded: Reference[] = [];
      for (const file of Array.from(files)) {
        const result = await api.uploadFile(file);
        uploaded.push({
          // 用 dataUrl 做预览（dev 模式下 Vite 不会代理 /files/，
          // 生产模式下也行；dataUrl 在内存里不依赖后端路由）
          preview: result.dataUrl,
          dataUrl: result.dataUrl,
          name: result.name,
        });
      }
      onChange([...references, ...uploaded]);
    } catch (e) {
      setError(`上传失败：${(e as Error).message}`);
    } finally {
      setUploading(false);
      // 清空 input value 以允许重新选择同名文件
      const input = document.getElementById('reference-input') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  };

  const removeAt = (i: number) => {
    onChange(references.filter((_, idx) => idx !== i));
  };

  return (
    <div className="field">
      <label>参考图（{references.length}/{maxCount}）</label>
      <div className="reference-grid">
        {references.map((ref, i) => (
          <div key={i} className="reference-item">
            <img src={ref.preview} alt={ref.name} />
            <button
              className="reference-remove"
              onClick={() => removeAt(i)}
              disabled={disabled}
              title="删除"
              type="button"
            >
              ×
            </button>
            <div className="reference-name">{ref.name}</div>
          </div>
        ))}
        {references.length < maxCount && (
          <label className={`reference-add ${disabled ? 'disabled' : ''}`}>
            <input
              id="reference-input"
              type="file"
              accept="image/*"
              multiple
              disabled={disabled || uploading}
              onChange={e => void handleFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            <div className="reference-add-icon">{uploading ? '⏳' : '＋'}</div>
            <div className="reference-add-text">{uploading ? '上传中' : '添加图片'}</div>
          </label>
        )}
      </div>
      {error && <div className="reference-error">{error}</div>}
    </div>
  );
}
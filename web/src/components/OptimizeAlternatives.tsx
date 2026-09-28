

interface Props {
  variants: string[];          // LLM 返回的候选
  originalPrompt: string;        // 用户原始输入（用于"保留原样"按钮）
  onPick: (prompt: string) => void; // 用户选了哪个
  onCancel: () => void;          // 用户取消
}

export function OptimizeAlternatives({
  variants,
  originalPrompt,
  onPick,
  onCancel,
}: Props) {
  return (
    <div className="alt-overlay" onClick={onCancel}>
      <div className="alt-modal" onClick={e => e.stopPropagation()}>
        <div className="alt-modal-header">
          <span className="alt-modal-title">✨ 选一个优化后的提示词</span>
          <button className="alt-modal-close" onClick={onCancel} type="button">×</button>
        </div>
        <div className="alt-modal-body">
          <button
            type="button"
            className="alt-option alt-option-original"
            onClick={() => onPick(originalPrompt)}
          >
            <div className="alt-option-label">📌 保留原样</div>
            <div className="alt-option-text">{originalPrompt}</div>
          </button>
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              className="alt-option"
              onClick={() => onPick(v)}
            >
              <div className="alt-option-label">方案 {i + 1}</div>
              <div className="alt-option-text">{v}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { HistoryItem } from '../types';

interface Props {
  refreshKey: number;
  onSelect: (item: HistoryItem) => void;
  onChanged?: () => void; // 删除/清空后通知父组件刷新
}

export function HistoryList({ refreshKey, onSelect, onChanged }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .history()
      .then(list => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const removeOne = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到 item onClick
    if (!confirm('删除这条历史？')) return;
    try {
      await api.deleteHistory(id);
      setItems(prev => prev.filter(it => it.id !== id));
      onChanged?.();
    } catch {
      /* ignore */
    }
  };

  const clearAll = async () => {
    if (items.length === 0) return;
    if (!confirm(`清空全部 ${items.length} 条历史？此操作不可恢复。`)) return;
    try {
      await api.clearHistory();
      setItems([]);
      onChanged?.();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="emoji">🕘</span>
        <span style={{ flex: 1 }}>历史记录</span>
        {items.length > 0 && (
          <button
            className="sidebar-action-btn"
            onClick={clearAll}
            title="清空全部"
            type="button"
          >
            🗑
          </button>
        )}
      </div>
      <div className="history-list">
        {loading && <div className="history-empty">加载中…</div>}
        {!loading && items.length === 0 && (
          <div className="history-empty">还没有生成记录</div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            className="history-item"
            onClick={() => onSelect(item)}
          >
            {item.mimeType?.startsWith('image/') && (
              <img
                className="history-img"
                src={`/api/history/${item.id}/thumb`}
                loading="lazy"
              />
            )}
            <div className="prompt">{item.prompt}</div>
            <div className="meta">
              <span>{item.backend}</span>
              <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
            </div>
            <button
              className="history-remove-btn"
              onClick={e => void removeOne(item.id, e)}
              title="删除"
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
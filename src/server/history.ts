/**
 * @Author Martin
 * @Date 2026/9/22
 *
 * 历史记录持久化（~/.grsai/web-history.json）
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { HistoryItem } from '../types/index.js';

const HISTORY_DIR = join(homedir(), '.grsai');
const HISTORY_FILE = join(HISTORY_DIR, 'web-history.json');
const MAX_ITEMS = 200;

async function ensureFile(): Promise<void> {
  if (!existsSync(HISTORY_FILE)) {
    await mkdir(HISTORY_DIR, { recursive: true });
    await writeFile(HISTORY_FILE, '[]', 'utf-8');
  }
}

async function readAll(): Promise<HistoryItem[]> {
  await ensureFile();
  try {
    const raw = await readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw) as HistoryItem[];
  } catch {
    return [];
  }
}

async function writeAll(items: HistoryItem[]): Promise<void> {
  await ensureFile();
  await writeFile(HISTORY_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

export async function listHistory(): Promise<HistoryItem[]> {
  const items = await readAll();
  // 最新在前
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addHistory(
  draft: Omit<HistoryItem, 'id' | 'createdAt'>,
): Promise<HistoryItem> {
  const items = await readAll();
  const item: HistoryItem = {
    ...draft,
    id: randomUUID(),
    createdAt: Date.now(),
  };
  items.push(item);
  // 保留最近 MAX_ITEMS 条
  if (items.length > MAX_ITEMS) {
    items.splice(0, items.length - MAX_ITEMS);
  }
  await writeAll(items);
  return item;
}

export async function deleteHistory(id: string): Promise<boolean> {
  const items = await readAll();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  await writeAll(items);
  return true;
}

/** 清空全部历史记录，返回删除条数 */
export async function clearHistory(): Promise<number> {
  const items = await readAll();
  const count = items.length;
  await writeAll([]);
  return count;
}

export async function getHistoryItem(id: string): Promise<HistoryItem | undefined> {
  const items = await readAll();
  return items.find(i => i.id === id);
}
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { type DownloadKind, useDownloadStore } from './download-store';
import { localFileNameFor } from './downloads-hash';

// 离线内容第二层(PM 2026-07-12:音频离线下载 + 观修 PPT 离线打开)——大文件(音频/课件图)
// 显式下载到本地,与第一层(查询结果自动持久化,见 query-persist-allowlist.ts)分工:
// 第一层管文字/结构化数据、自动生效;这层管二进制大文件、需用户主动点下载(有存储体积影响)。
//
// expo-file-system 新版 API(SDK54+,new File()/new Directory())官方明确不支持 web
// (源码 ExpoFileSystem.web.ts 每个方法都只 console.warn 后返回空/no-op)——这里整体按平台
// 关掉,web 上"下载"按钮不渲染、播放器/幻灯始终走远程 URL,不假装支持、也不让它在 web 崩溃。
export const DOWNLOADS_SUPPORTED = Platform.OS !== 'web';

const downloadsDir = DOWNLOADS_SUPPORTED ? new Directory(Paths.document, 'offline-downloads') : null;

function ensureDir(): void {
  if (downloadsDir && !downloadsDir.exists) downloadsDir.create({ idempotent: true });
}

function localFileFor(url: string): File | null {
  if (!downloadsDir) return null;
  return new File(downloadsDir, localFileNameFor(url));
}

export function getLocalSizeBytes(url: string): number | null {
  const f = localFileFor(url);
  return f && f.exists ? f.size : null;
}

export async function downloadAsset(url: string, onProgress?: (ratio: number) => void): Promise<string> {
  if (!DOWNLOADS_SUPPORTED) throw new Error('此平台不支持离线下载');
  ensureDir();
  const dest = localFileFor(url)!;
  const task = File.createDownloadTask(url, dest, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (onProgress && totalBytes > 0) onProgress(bytesWritten / totalBytes);
    },
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error('下载未完成'); // 正常路径不会是 null(null=暂停态,这里没用暂停)
  return file.uri;
}

export function deleteAsset(url: string): void {
  const f = localFileFor(url);
  if (f && f.exists) f.delete();
}

export type DownloadUiState = 'none' | 'downloading' | 'done';

// 下载态 + 动作合一(UI 只用这一个 hook):entries/progress 读 Zustand(跨组件、跨页共享同一份状态,
// 音频播放器和「管理下载」页看到的是同一份);实际下载/删除走上面几个文件系统函数。
export function useDownloadAsset(url: string | null | undefined, kind: DownloadKind, label: string) {
  const entry = useDownloadStore((s) => (url ? s.entries[url] : undefined));
  const progressRatio = useDownloadStore((s) => (url ? s.progress[url] : undefined));
  const setEntry = useDownloadStore((s) => s.setEntry);
  const removeEntry = useDownloadStore((s) => s.removeEntry);
  const setProgress = useDownloadStore((s) => s.setProgress);

  const state: DownloadUiState = entry ? 'done' : progressRatio != null ? 'downloading' : 'none';

  const start = async () => {
    if (!url || !DOWNLOADS_SUPPORTED || state !== 'none') return;
    setProgress(url, 0);
    try {
      const localUri = await downloadAsset(url, (ratio) => setProgress(url, ratio));
      setEntry({ url, localUri, kind, label, sizeBytes: getLocalSizeBytes(url) ?? 0, downloadedAt: Date.now() });
    } finally {
      setProgress(url, null);
    }
  };

  const remove = () => {
    if (!url) return;
    deleteAsset(url);
    removeEntry(url);
  };

  return { state, progressRatio: progressRatio ?? 0, localUri: entry?.localUri ?? null, start, remove };
}

// 一组 url 合一下载(PPT 逐页图片当一个整体处理,不逐页给按钮)。done = 全部页都已下载;
// 部分失败/只下了一半时按钮仍显示可点(未完成的当"未下载"处理,重按只补下缺的,不重下已成功的)。
export function useDownloadAssetGroup(urls: string[], kind: DownloadKind, labelPrefix: string) {
  const entries = useDownloadStore((s) => s.entries);
  const progressMap = useDownloadStore((s) => s.progress);
  const setEntry = useDownloadStore((s) => s.setEntry);
  const removeEntry = useDownloadStore((s) => s.removeEntry);
  const setProgress = useDownloadStore((s) => s.setProgress);

  const total = urls.length;
  const doneCount = urls.filter((u) => entries[u]).length;
  const isDownloading = urls.some((u) => progressMap[u] != null);
  const state: DownloadUiState = total > 0 && doneCount === total ? 'done' : isDownloading ? 'downloading' : 'none';
  const progressRatio = total > 0 ? urls.reduce((sum, u) => sum + (entries[u] ? 1 : (progressMap[u] ?? 0)), 0) / total : 0;

  const start = async () => {
    if (!DOWNLOADS_SUPPORTED || total === 0 || state !== 'none') return;
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      if (entries[u]) continue; // 已下载过的跳过
      setProgress(u, 0);
      try {
        const localUri = await downloadAsset(u, (ratio) => setProgress(u, ratio));
        setEntry({ url: u, localUri, kind, label: `${labelPrefix} · 第${i + 1}页`, sizeBytes: getLocalSizeBytes(u) ?? 0, downloadedAt: Date.now() });
      } finally {
        setProgress(u, null);
      }
    }
  };

  const remove = () => {
    for (const u of urls) { deleteAsset(u); removeEntry(u); }
  };

  return { state, progressRatio, start, remove };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 离线下载元数据(哪些资源已下载、多大、何时)——文件本体在 expo-file-system 管的本地磁盘,
// 这里只记"清单",供「管理下载」页列出 + 算总占用。同 font-scale.ts 先例:Zustand + persist(AsyncStorage)。
export type DownloadKind = 'audio' | 'slide';

export type DownloadEntry = {
  url: string;
  localUri: string;
  kind: DownloadKind;
  label: string; // 展示用,如"第1课 · 上师讲记音频"
  sizeBytes: number;
  downloadedAt: number; // epoch ms,仅展示排序用
};

type DownloadStoreState = {
  entries: Record<string, DownloadEntry>; // key = 远程 url
  progress: Record<string, number>; // key = url,0~1,下载中才有值;不持久化(重启后没有"进行中"这回事)
  setEntry: (e: DownloadEntry) => void;
  removeEntry: (url: string) => void;
  clearAll: () => void;
  setProgress: (url: string, ratio: number | null) => void; // null = 清除(完成/失败/取消)
};

export const useDownloadStore = create<DownloadStoreState>()(
  persist(
    (set) => ({
      entries: {},
      progress: {},
      setEntry: (e) => set((s) => ({ entries: { ...s.entries, [e.url]: e } })),
      removeEntry: (url) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[url];
          return { entries: next };
        }),
      clearAll: () => set({ entries: {} }),
      setProgress: (url, ratio) =>
        set((s) => {
          const next = { ...s.progress };
          if (ratio == null) delete next[url];
          else next[url] = ratio;
          return { progress: next };
        }),
    }),
    {
      name: 'sss-downloads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries }), // progress 是运行时瞬态,不持久化
    },
  ),
);

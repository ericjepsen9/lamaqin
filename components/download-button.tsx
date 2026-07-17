import { Check, Download, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text as RNText, StyleSheet, View } from 'react-native';

import { notify } from '@/lib/dialog';
import type { DownloadKind } from '@/lib/download-store';
import { DOWNLOADS_SUPPORTED, type DownloadUiState, useDownloadAsset, useDownloadAssetGroup } from '@/lib/downloads';

const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const INK3 = '#7e6d5b';

// 三态展示(未下载/下载中/已下载)——单个 url(音频)和一组 url(PPT 逐页)共用同一份视觉,
// 状态判断分别由 useDownloadAsset / useDownloadAssetGroup 给,视觉这里只认 state/progressRatio。
function DownloadStateView({ state, progressRatio, onStart, onRemove }: {
  state: DownloadUiState; progressRatio: number; onStart: () => void; onRemove: () => void;
}) {
  if (state === 'downloading') {
    return (
      <View style={styles.pill}>
        <ActivityIndicator size="small" color={SAFFRON_DARK} />
        <RNText style={styles.txt}>{Math.round(progressRatio * 100)}%</RNText>
      </View>
    );
  }
  if (state === 'done') {
    return (
      <Pressable style={[styles.btn, styles.done]} onPress={onRemove} hitSlop={8}>
        <Check size={13} color={SAGE} />
        <RNText style={[styles.txt, { color: SAGE }]}>已下载</RNText>
        <X size={12} color={INK3} />
      </Pressable>
    );
  }
  return (
    <Pressable style={styles.btn} hitSlop={8} onPress={onStart}>
      <Download size={13} color={SAFFRON_DARK} />
      <RNText style={styles.txt}>离线下载</RNText>
    </Pressable>
  );
}

// 离线下载入口(音频用):未下载→下载中(百分比)→已下载(点击=删除本地缓存,远程内容还在,
// 不是"删数据")。web 不支持(见 lib/downloads.ts),整个按钮不渲染。
export function DownloadButton({ url, kind, label }: { url: string | null | undefined; kind: DownloadKind; label: string }) {
  const { state, progressRatio, start, remove } = useDownloadAsset(url, kind, label);
  if (!DOWNLOADS_SUPPORTED || !url) return null;
  return (
    <DownloadStateView
      state={state}
      progressRatio={progressRatio}
      onStart={() => start().catch((e) => notify('下载失败', e instanceof Error ? e.message : '请检查网络后重试'))}
      onRemove={remove}
    />
  );
}

// 离线下载入口(PPT 逐页图片用):一组 url 当一个整体下载/删除,不逐页给按钮。
export function DownloadGroupButton({ urls, kind, labelPrefix }: { urls: string[]; kind: DownloadKind; labelPrefix: string }) {
  const { state, progressRatio, start, remove } = useDownloadAssetGroup(urls, kind, labelPrefix);
  if (!DOWNLOADS_SUPPORTED || urls.length === 0) return null;
  return (
    <DownloadStateView
      state={state}
      progressRatio={progressRatio}
      onStart={() => start().catch((e) => notify('下载失败', e instanceof Error ? e.message : '请检查网络后重试'))}
      onRemove={remove}
    />
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(224,120,86,0.4)',
    alignSelf: 'flex-start',
  },
  done: { borderColor: 'rgba(111,154,134,0.4)' },
  txt: { fontSize: 11, fontWeight: '700', color: SAFFRON_DARK },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, alignSelf: 'flex-start' },
});

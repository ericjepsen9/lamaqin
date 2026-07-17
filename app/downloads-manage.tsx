import { useRouter } from 'expo-router';
import { ChevronLeft, FileImage, Headphones, Trash2 } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { confirmAsync } from '@/lib/dialog';
import { useDownloadStore } from '@/lib/download-store';
import { deleteAsset } from '@/lib/downloads';

// 离线下载管理(PM 2026-07-12 · 离线第二层):列出已下载的音频/课件图,能看总占用、能单条删、能清空。
// 纯本地状态(Zustand + AsyncStorage,见 lib/download-store.ts),不是服务端数据,没有联网/权限概念。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const CRIM = '#a13c2e';
const SAGE = '#6f9a86';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DownloadsManage() {
  const router = useRouter();
  const entries = useDownloadStore((s) => s.entries);
  const removeEntry = useDownloadStore((s) => s.removeEntry);
  const clearAllEntries = useDownloadStore((s) => s.clearAll);
  const list = Object.values(entries).sort((a, b) => b.downloadedAt - a.downloadedAt);
  const totalBytes = list.reduce((sum, e) => sum + e.sizeBytes, 0);

  const removeOne = async (url: string, label: string) => {
    if (!(await confirmAsync('删除这份离线内容?', `${label}\n删除后可再次点「离线下载」重新下载。`))) return;
    deleteAsset(url);
    removeEntry(url);
  };

  const clearAll = async () => {
    if (list.length === 0) return;
    if (!(await confirmAsync('清空全部离线下载?', `共 ${list.length} 项 · ${formatBytes(totalBytes)},远程内容不受影响,可随时重新下载。`))) return;
    for (const e of list) deleteAsset(e.url);
    clearAllEntries();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>离线下载管理</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={styles.summary}>
          <Text style={{ fontSize: 13, color: INK2 }}>共 {list.length} 项 · 占用 {formatBytes(totalBytes)}</Text>
          {list.length > 0 ? (
            <Pressable onPress={clearAll} hitSlop={6}><Text style={{ fontSize: 12, color: CRIM, fontWeight: '700' }}>清空全部</Text></Pressable>
          ) : null}
        </View>

        {list.length === 0 ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>
              暂无离线下载内容{'\n'}在课时页的音频 / 观修课件旁点「离线下载」,没有网络时也能打开
            </Text>
          </View>
        ) : (
          <View style={styles.group}>
            {list.map((e, i) => (
              <View key={e.url} style={[styles.row, i < list.length - 1 && styles.rowBorder]}>
                {e.kind === 'audio' ? <Headphones size={18} color={SAGE} /> : <FileImage size={18} color={SAGE} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: INK }} numberOfLines={1}>{e.label}</Text>
                  <Text style={{ fontSize: 11, color: INK3, marginTop: 1 }}>{formatBytes(e.sizeBytes)}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => removeOne(e.url, e.label)}><Trash2 size={17} color={INK3} /></Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  group: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
});

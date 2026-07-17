import { Maximize2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, LayoutChangeEvent, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { DownloadGroupButton } from '@/components/download-button';
import { useDownloadStore } from '@/lib/download-store';

import { Text } from '@/components/ui/text';
// 课件(PPT)幻灯浏览器 = 觉学 SlideViewer 图片版(决策161·Q2「参考觉学」)。
// PPT 由运营导出成图片(imageUrls);App 横向翻页 + 页码 + 全屏(性能优于 PDF.js)。
// 离线第二层(PM 2026-07-12):逐页图片当一组整体下载(DownloadGroupButton),
// 下载后本地有缓存就显示本地文件,不管有没有网(同 AudioPlayer 的本地优先套路)。
export function SlideViewer({ imageUrls, title }: { imageUrls: string[]; title?: string }) {
  const [page, setPage] = useState(1);
  const [w, setW] = useState(0);
  const [full, setFull] = useState(false);
  const { width: scrW } = useWindowDimensions();
  const N = imageUrls.length;
  const entries = useDownloadStore((s) => s.entries);
  const localUrls = imageUrls.map((u) => entries[u]?.localUri ?? u);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (w > 0) setPage(Math.min(N, Math.max(1, Math.round(e.nativeEvent.contentOffset.x / w) + 1)));
  };

  return (
    <View>
      <View style={styles.frame} onLayout={onLayout}>
        {w > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
            {localUrls.map((u, i) => <Image key={i} source={{ uri: u }} style={{ width: w, height: (w * 9) / 16 }} resizeMode="contain" />)}
          </ScrollView>
        ) : null}
        <View style={styles.pageTag}><Text style={styles.pageTxt}>{page} / {N}</Text></View>
        <Pressable style={styles.fsBtn} onPress={() => setFull(true)}><Maximize2 size={13} color="#fff" /><Text style={styles.fsTxt}>全屏</Text></Pressable>
      </View>
      <View style={{ marginTop: 8 }}>
        <DownloadGroupButton urls={imageUrls} kind="slide" labelPrefix={title ?? '课件'} />
      </View>

      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}>
        <View style={styles.modal}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {localUrls.map((u, i) => (
              <View key={i} style={{ width: scrW, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: u }} style={{ width: scrW, height: (scrW * 9) / 16 }} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
          {title ? <Text style={styles.modalTitle}>{title}</Text> : null}
          <Pressable style={styles.close} hitSlop={10} onPress={() => setFull(false)}><X size={22} color="#fff" /></Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1f1a14' },
  pageTag: { position: 'absolute', bottom: 8, right: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.5)' },
  pageTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fsBtn: { position: 'absolute', top: 8, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.5)' },
  fsTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { position: 'absolute', top: 60, color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  close: { position: 'absolute', top: 52, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});

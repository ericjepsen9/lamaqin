import { Play } from 'lucide-react-native';
import { memo, useState } from 'react';
// @ts-expect-error react-dom 无类型声明(@types/react-dom 未装);flushSync 运行时存在、web 构建正常
import { flushSync } from 'react-dom';
import { Image, Pressable, StyleSheet, Text as RNText, View } from 'react-native';

// YouTube facade 的 **web 版**(Metro 自动按平台取此文件,原生走 youtube-facade.tsx)。
// 原生版用 react-native-youtube-iframe(走 webview);该库 web 入口会 require
//   `react-native-web-webview`(未装)——会打断 `expo export --platform web`。故 web 直接用原生 <iframe>。
// 「点封面 → 自动播放」(决策161 + PM 2026-06-27):
//   关键是 iframe 必须在**用户点击手势内同步创建**,浏览器才放行带 autoplay 的播放。
//   原来用 setState 异步渲染 → iframe 在手势结束后才挂载 → 被浏览器挡(还要再点一次 YouTube 播放键)。
//   改用 flushSync 在 onPress 内同步挂载 iframe(lite-youtube 同款做法)→ 点封面即播。
// memo:隔离父组件重渲染(如观修步每秒计时器),否则播放器会被重置 → 自动暂停。
export const YouTubeFacade = memo(function YouTubeFacade({ videoId, cover, title, ratio = 16 / 9 }: { videoId?: string; cover?: string; title?: string; ratio?: number }) {
  const [playing, setPlaying] = useState(false);
  // 封面:自定义 cover > YouTube maxresdefault(16:9 高清),404 则 onError 回退 hqdefault(4:3 带黑边,不打头用)。
  const [hdFailed, setHdFailed] = useState(false);
  const ytThumb = videoId ? `https://img.youtube.com/vi/${videoId}/${hdFailed ? 'hqdefault' : 'maxresdefault'}.jpg` : undefined;
  const coverUri = cover || ytThumb;
  // flushSync:同步挂载播放器(在点击手势内创建 iframe),浏览器才放行 autoplay → 点一次就播。
  const onPress = () => { if (videoId) flushSync(() => setPlaying(true)); };

  // 已点播放 → 内嵌 iframe(autoplay;点了才挂载,首屏不起播放器)
  if (playing && videoId) {
    return (
      <View style={[styles.playerWrap, { aspectRatio: ratio }]}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`}
          style={{ width: '100%', height: '100%', border: 0, borderRadius: 12 }}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          title={title ?? 'YouTube'}
        />
      </View>
    );
  }

  // 封面态(自定义 cover > YouTube 缩略图 + 我们的播放按钮 + 标题条)
  return (
    <Pressable style={[styles.wrap, { aspectRatio: ratio }]} onPress={onPress} disabled={!videoId}>
      {coverUri ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => { if (!cover && !hdFailed) setHdFailed(true); }} /> : null}
      <View style={styles.scrim} />
      {videoId ? (
        <View style={styles.playCircle}><Play size={26} color="#b35535" fill="#b35535" /></View>
      ) : (
        <RNText style={styles.noVideo}>暂无视频</RNText>
      )}
      {title ? <RNText style={styles.title} numberOfLines={1}>{title}</RNText> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#2b2218', alignItems: 'center', justifyContent: 'center' },
  playerWrap: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(43,34,24,0.22)' },
  playCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  noVideo: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  title: { position: 'absolute', left: 12, right: 12, bottom: 10, color: '#fff', fontSize: 13, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4 },
});

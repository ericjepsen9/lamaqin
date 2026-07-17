import { Play } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

import { Text } from '@/components/ui/text';
// 通用 YouTube「封面 + 点击内嵌播放」(facade·决策161)。
// 平时只显示封面 + 播放按钮;点一下才挂载播放器(首屏快 / 省流量 / 点了才起 webview)。
// 内嵌播放(CLAUDE.md 锁定 react-native-youtube-iframe·PM 2026-06-25 选「应用内内嵌」):
//   点封面 → 挂 <YoutubePlayer>,Expo Go(自带 webview)/ web 均在 App 内播,不再跳转 YouTube。
// 封面优先级(决策161·Q1):自定义 cover > YouTube 自带缩略图(hqdefault)。
// 高度:onLayout 测容器宽,按 ratio 算高(YoutubePlayer 需数值 height);未测到宽前用占位高,等测到再挂播放器。
// ⚠️ memo:隔离父组件重渲染(如观修步每秒计时器),否则 props 不变也会重渲染、播放器被重置→自动暂停。
export const YouTubeFacade = memo(function YouTubeFacade({ videoId, cover, title, ratio = 16 / 9 }: { videoId?: string; cover?: string; title?: string; ratio?: number }) {
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(0);
  // 封面优先级:自定义 cover > YouTube 缩略图。YouTube 先试 maxresdefault(16:9 高清),
  //   404(无 HD 版)则 onError 回退 hqdefault。不用 hqdefault 打头是因它 4:3、上下黑边。
  const [hdFailed, setHdFailed] = useState(false);
  const ytThumb = videoId ? `https://img.youtube.com/vi/${videoId}/${hdFailed ? 'hqdefault' : 'maxresdefault'}.jpg` : undefined;
  const coverUri = cover || ytThumb;
  const height = width > 0 ? Math.round(width / ratio) : 0;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onPress = () => { if (videoId) setPlaying(true); };

  // 已点播放且已测到宽 → 内嵌播放器
  if (playing && videoId && width > 0) {
    return (
      <View onLayout={onLayout} style={[styles.playerWrap, { height }]}>
        <YoutubePlayer
          height={height}
          width={width}
          play
          videoId={videoId}
          webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
          onError={() => setPlaying(false)}
        />
      </View>
    );
  }

  // 封面态(也作为测宽的首帧:点播放前 onLayout 已跑过,width 就绪)
  return (
    <Pressable onLayout={onLayout} style={[styles.wrap, { aspectRatio: ratio }]} onPress={onPress} disabled={!videoId}>
      {coverUri ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => { if (!cover && !hdFailed) setHdFailed(true); }} /> : null}
      <View style={styles.scrim} />
      {videoId ? (
        <View style={styles.playCircle}><Play size={26} color="#b35535" fill="#b35535" /></View>
      ) : (
        <Text style={styles.noVideo}>暂无视频</Text>
      )}
      {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from 'react-native';

import { AudioPlayer as ExpoAudioPlayer, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Headphones, Pause, Play } from 'lucide-react-native';

import { DownloadButton } from '@/components/download-button';
import { useDownloadStore } from '@/lib/download-store';

const SAFFRON = '#E07856';
const SAFFRON_DARK = '#B8522A';
const INK = '#2B2218';
const INK3 = '#9E8E80';

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

const RATES = [1, 1.5, 2] as const;
type Rate = (typeof RATES)[number];

type Props = {
  url: string;
  title: string;
  subtitle?: string;
};

export function AudioPlayer({ url, title, subtitle }: Props) {
  // 离线下载第二层:本地有缓存就播本地(不管有没有网),没有就播远程——对播放逻辑透明,
  // 调用方不用改,下载状态另见 DownloadButton(同一份 Zustand store,下载完成这里自动切换)。
  const localUri = useDownloadStore((s) => s.entries[url]?.localUri);
  const playUri = localUri ?? url;
  // 2026-07: expo-av 停止维护且其安卓预编译包与 SDK56 不兼容(启动即崩),迁移到 expo-audio。
  // 注意单位差异:expo-audio 的 currentTime/duration/seekTo 用秒,本组件 UI 仍以毫秒计。
  const playerRef = useRef<ExpoAudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const [durMs, setDurMs] = useState(0);
  const [rate, setRate] = useState<Rate>(1);
  const [loading, setLoading] = useState(true);

  // 拖动态:scrubMs 非 null = 正在拖,显示拖到的位置(松手才真 seek,拖动中不抖)。
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [trackW, setTrackW] = useState(0);
  // PanResponder 闭包里读最新值用 ref(create 只跑一次)。写ref放进effect(react-hooks/refs·
  // 2026-07-17 lint债清理):渲染期间同步写ref本身是新版规则不允许的impure操作,改成effect后
  // 时机上仍然是"每次trackW/durMs变化后尽快同步",手势回调触发时(用户真实交互,必然晚于
  // 任意一次effect)读到的都是最新值,行为不变。
  const trackWRef = useRef(0);
  const durRef = useRef(0);
  useEffect(() => { trackWRef.current = trackW; }, [trackW]);
  useEffect(() => { durRef.current = durMs; }, [durMs]);

  useEffect(() => {
    let mounted = true;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

    const player = createAudioPlayer({ uri: playUri }, { updateInterval: 250 });
    playerRef.current = player;
    player.setPlaybackRate(rate);

    const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!mounted) return;
      if (status.isLoaded) {
        setIsPlaying(status.playing);
        setPosMs(status.currentTime * 1000);
        setDurMs((status.duration || 0) * 1000);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.remove();
      playerRef.current = null;
      try {
        player.release();
      } catch {
        // 已释放时忽略
      }
    };
  }, [playUri]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = async () => {
    if (!playerRef.current) return;
    if (isPlaying) playerRef.current.pause();
    else playerRef.current.play();
  };

  const cycleRate = async () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    playerRef.current?.setPlaybackRate(next);
  };

  const seekToMs = async (ms: number) => {
    if (!playerRef.current || durRef.current <= 0) return;
    const clamped = Math.max(0, Math.min(ms, durRef.current));
    setPosMs(clamped); // 乐观更新,避免松手到下次回调间的回跳
    await playerRef.current.seekTo(clamped / 1000);
  };

  // 由触点横坐标(相对轨道)算时间。轨道宽来自 onLayout(可靠,不用 hacky measure)。
  const msFromX = (x: number) => {
    const w = trackWRef.current;
    if (w <= 0) return 0;
    return (Math.max(0, Math.min(x, w)) / w) * durRef.current;
  };

  // 拖动:子元素 pointerEvents=none → locationX 始终相对轨道(web/原生一致)。
  // react-hooks/refs 在这里是静态分析的假阳性(2026-07-17 lint债清理确认):PanResponder.create()
  // 只是把下面这些函数打包成responder对象,不会在渲染期间同步调用它们——onPanResponderXxx只在
  // 真实手势事件发生时才被调用,那时早已不在render阶段,读trackWRef.current/durRef.current
  // 是安全的。lint规则看不到"这些函数只在事件回调里才执行"这层语义,所以保守报警。
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // eslint-disable-next-line react-hooks/refs
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setScrubMs(msFromX(e.nativeEvent.locationX)),
        onPanResponderMove: (e) => setScrubMs(msFromX(e.nativeEvent.locationX)),
        onPanResponderRelease: async (e) => {
          await seekToMs(msFromX(e.nativeEvent.locationX));
          setScrubMs(null);
        },
        onPanResponderTerminate: () => setScrubMs(null),
      }),
    [],
  );

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);
  const shownMs = scrubMs ?? posMs;
  const ratio = durMs > 0 ? Math.max(0, Math.min(shownMs / durMs, 1)) : 0;
  const pct = `${ratio * 100}%` as `${number}%`;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#FBE5DA', borderWidth: 1, borderColor: 'rgba(224,120,86,0.3)' }}>
      <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Headphones size={20} color={SAFFRON_DARK} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: INK3 }} numberOfLines={1}>{subtitle}</Text> : null}
        <DownloadButton url={url} kind="audio" label={subtitle ? `${title} · ${subtitle}` : title} />

        {/* 可拖动进度条:外层 18px 高透明热区(好按),内部 4px 视觉条 + 滑块 */}
        <View
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
          style={{ height: 18, justifyContent: 'center', marginVertical: 2 }}
        >
          <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.15)', overflow: 'hidden' }}>
            <View style={{ width: pct, height: 4, borderRadius: 2, backgroundColor: SAFFRON }} />
          </View>
          {durMs > 0 ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: pct }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: '#fff', borderWidth: 2, borderColor: SAFFRON }} />
            </View>
          ) : null}
        </View>

        <Text style={{ fontSize: 11, color: INK3 }}>{fmtMs(shownMs)} / {durMs > 0 ? fmtMs(durMs) : '--:--'}</Text>
      </View>

      <Pressable onPress={cycleRate} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(43,34,24,0.08)' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: INK3 }}>{rate}×</Text>
      </Pressable>

      <Pressable
        onPress={togglePlay}
        disabled={loading}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: loading ? 'rgba(224,120,86,0.4)' : SAFFRON, alignItems: 'center', justifyContent: 'center' }}
      >
        {isPlaying ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
      </Pressable>
    </View>
  );
}

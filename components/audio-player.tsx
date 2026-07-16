import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from 'react-native';

import { Audio, AVPlaybackStatus } from 'expo-av';
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const [durMs, setDurMs] = useState(0);
  const [rate, setRate] = useState<Rate>(1);
  const [loading, setLoading] = useState(true);

  // 拖动态:scrubMs 非 null = 正在拖,显示拖到的位置(松手才真 seek,拖动中不抖)。
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [trackW, setTrackW] = useState(0);
  // PanResponder 闭包里读最新值用 ref(create 只跑一次)。
  const trackWRef = useRef(0);
  const durRef = useRef(0);
  trackWRef.current = trackW;
  durRef.current = durMs;

  useEffect(() => {
    let mounted = true;
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});

    Audio.Sound.createAsync(
      { uri: playUri },
      { shouldPlay: false, rate, progressUpdateIntervalMillis: 250 },
      (status: AVPlaybackStatus) => {
        if (!mounted) return;
        if (status.isLoaded) {
          setIsPlaying(status.isPlaying);
          setPosMs(status.positionMillis);
          setDurMs(status.durationMillis ?? 0);
          setLoading(false);
        }
      },
    ).then(({ sound }) => {
      if (mounted) soundRef.current = sound;
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [playUri]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  };

  const cycleRate = async () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (soundRef.current) await soundRef.current.setRateAsync(next, true);
  };

  const seekToMs = async (ms: number) => {
    if (!soundRef.current || durRef.current <= 0) return;
    const clamped = Math.max(0, Math.min(ms, durRef.current));
    setPosMs(clamped); // 乐观更新,避免松手到下次回调间的回跳
    await soundRef.current.setPositionAsync(Math.floor(clamped));
  };

  // 由触点横坐标(相对轨道)算时间。轨道宽来自 onLayout(可靠,不用 hacky measure)。
  const msFromX = (x: number) => {
    const w = trackWRef.current;
    if (w <= 0) return 0;
    return (Math.max(0, Math.min(x, w)) / w) * durRef.current;
  };

  // 拖动:子元素 pointerEvents=none → locationX 始终相对轨道(web/原生一致)。
  const panResponder = useMemo(
    () =>
      PanResponder.create({
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
    [], // eslint-disable-line react-hooks/exhaustive-deps
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

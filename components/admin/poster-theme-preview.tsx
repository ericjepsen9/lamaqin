import { BookOpen, Flower2, Home as HomeIcon, Users } from 'lucide-react-native';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { BigCard } from '@/app/(student)/home';
import { TabBarVisual } from '@/app/(student)/_layout';
import { testIds } from '@/lib/testids';
import { readableTextTone } from '@/lib/utils';

// 画报强调色/透明度 实时预览窗(2026-07-18·PM"先做预览窗"):后台改色/改透明度时,管理员能马上
// 看到首页卡片+底部tab栏的实际效果,不用保存后再去 app 里翻页确认。
// 直接复用 BigCard(app/(student)/home.tsx 导出)+ TabBarVisual(app/(student)/_layout.tsx 抽出的
// 纯视觉部分)——不是照着样式抄一份"看起来差不多"的预览,是同一份渲染代码,保证跟线上永远一致。
export function PosterThemePreview({ imageUrl, accentColor, overlayOpacity }: {
  imageUrl: string;
  accentColor: string | null; // null = 未设置/无效,预览走默认配色(与线上"未设置"语义一致)
  overlayOpacity: number;
}) {
  const tone = readableTextTone(accentColor);
  return (
    <View style={styles.frame}>
      {imageUrl ? (
        <ImageBackground source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallbackBg]} />
      )}
      <View style={styles.bottomStack}>
        <View style={styles.cardsRow}>
          <View style={{ flex: 1 }}>
            <BigCard onPress={() => {}} Icon={BookOpen} title="每日功课" sub="本周第 3 周 · 4 节" accentColor={accentColor} overlayOpacity={overlayOpacity} textTone={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <BigCard onPress={() => {}} Icon={Flower2} title="共修法会" sub="共修法会 · 发愿回向" accentColor={accentColor} overlayOpacity={overlayOpacity} textTone={tone} />
          </View>
        </View>
        <TabBarVisual
          bgTestID={testIds.posterTheme.previewTabBarBg}
          accentColor={accentColor}
          overlayOpacity={overlayOpacity}
          items={[
            { key: 'home', label: '首页', Icon: HomeIcon, active: true },
            { key: 'courses', label: '闻思', Icon: BookOpen },
            { key: 'practice', label: '修持', Icon: Flower2 },
            { key: 'class', label: '班级', Icon: Users },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: 280, borderRadius: 18, overflow: 'hidden', backgroundColor: '#2b2218', marginBottom: 12 },
  fallbackBg: { backgroundColor: '#cfa978' },
  bottomStack: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 10 },
  cardsRow: { flexDirection: 'row', gap: 8 },
});

# 管理端 · 新增页面指南（让新页面省力 + 默认统一）

> 2026-06-25 建立 · App 线维护。配套：组件源 `components/ui/admin-kit.tsx`、色值源 `lib/theme.ts`、规范 `ui_spec_v2.md §9`。
> 目的：新增后台页面时**照此起步**，UI 自动和全后台一致，数据读写有统一模式，不再从空白页 copy-paste。
> ⚠️ docs 只读副本，回中枢同源订正后再覆盖同步（防分叉）。

## 铁律（先看这条）
1. **UI 一律用 admin-kit 组件**，不在页面里自己写 badge/card/button/头像/表格/弹窗的 StyleSheet。
2. **颜色只从 `lib/theme.ts` 引用**，不硬编码色值；状态色走 `Badge` 的 `tone`（见下映射）。
3. **页面骨架用 `Screen`**，不每页手写 `SafeAreaView + ScrollView + 背景`。
4. **写操作用 `useAdminMutation`**，不每页各写一套 invalidate/错误处理。

## 三步加一个新页面

**① 路由文件**：在 `app/(admin)/<区>/index.tsx` 建列表页，详情页用 `app/(admin)/<区>/[id].tsx`。侧栏入口加在 `app/(admin)/_layout.tsx` 的 `NAV_ITEMS`（含 `roles` 角色可见性）。

**② 读数据**：在 `lib/queries/admin/<区>.ts` 写 `useXxx` 查询（参照 `students.ts`）。RLS 已按角色过滤，查询里不用再判角色。

**③ 写操作**：同文件用 `useAdminMutation` 写 `useXxxMutation`（参照 `students.ts` 的 `useApproveStudent`）。

## 组件速查（从 `@/components/ui/admin-kit`）
`Screen`(骨架) · `DetailHeader`(详情返回栏) · `Card`/`SectionCard`/`SectionHeader` · `Badge`(tone) · `Avatar` · `AdminButton`(primary/secondary/negative/confirm/danger) · `StatCard` · `SearchBar` · `FilterChips`(可换行单选) · `SegmentedControl`(等宽分段单选) · `Table`/`TableRow` · `AdminModal`/`ModalField`/`ModalActions`/`ModalFootnote` · `Divider`/`EmptyState` · `SCREEN_BG`。

**状态→tone 映射**：在读/正常/已完成→`sage`；待审/提醒/落后→`saffron`；偏滞/等第→`gold`；危险/否决→`crimson`；中性/已离→`neutral`；密法→`violet`；第7类（如题型）→`teal`。

**按钮变体**：主操作→`primary`；次要(编辑/上传)→`secondary`；取消/拒绝→`negative`；正向确认(确认毕业)→`confirm`；删除/撤销→`danger`。

## 列表页模板（copy 起步）

```tsx
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import {
  Avatar, Badge, Card, EmptyState, FilterChips, Screen, SearchBar,
  type BadgeTone,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { SAFFRON } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
// import { useXxxList } from '@/lib/queries/admin/xxx';

const STATUS_TONE: Record<string, BadgeTone> = { active: 'sage', pending: 'saffron' };

export default function XxxScreen() {
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [search, setSearch] = useState('');
  useEffect(() => { setTitle('某某管理'); }, [setTitle]);

  // const { data, isLoading, error } = useXxxList();
  const data: any[] = [], isLoading = false, error = null; // TODO: 接 useXxxList

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON} /></View>;
  if (error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>加载失败</Text></View>;

  return (
    <Screen scroll header={<SearchBar value={search} onChangeText={setSearch} placeholder="搜索…" />}>
      {data.map((item) => (
        <Card key={item.id} onPress={() => router.push(`/(admin)/xxx/${item.id}` as never)} style={{ padding: 15, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={item.name} />
            <Text className="font-serif" style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
            <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>{item.statusLabel}</Badge>
          </View>
        </Card>
      ))}
      {data.length === 0 && <EmptyState>暂无数据</EmptyState>}
    </Screen>
  );
}
```

## 详情页模板（copy 起步）

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AdminButton, DetailHeader, Screen, SectionCard } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
// import { useXxxDetail, useSaveXxx } from '@/lib/queries/admin/xxx';

export default function XxxDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // const { data } = useXxxDetail(id);
  // const save = useSaveXxx();

  return (
    <Screen scroll header={<DetailHeader title="详情" onBack={() => router.back()} />}>
      <SectionCard title="基本信息">
        <Text>…</Text>
      </SectionCard>
      <SectionCard title="管理操作">
        {/* <AdminButton variant="primary" disabled={save.isPending} onPress={() => save.mutate(id)}>保存</AdminButton> */}
      </SectionCard>
    </Screen>
  );
}
```

## 数据读写模式（`lib/queries/admin/xxx.ts`）

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAdminMutation } from './mutations';

// 读：RLS 已按角色过滤可见范围，查询里不用再判角色
export function useXxxList() {
  return useQuery({
    queryKey: ['admin-xxx'],
    queryFn: async () => {
      const { data, error } = await supabase.from('xxx').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// 写：传 supabase 写函数 + 成功后刷新的 key；UI 调 .mutate(arg)
export function useSaveXxx() {
  return useAdminMutation<{ id: string; patch: object }>({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from('xxx').update(patch).eq('id', id);
      if (error) throw error;
    },
    invalidateKeys: [['admin-xxx']],
  });
}
```

## 活样板（真实可参照页面）
- 列表 + 宽屏 Master-Detail（PC 右侧详情面板）：`app/(admin)/students/index.tsx`
- 详情页（返回栏 + 分区卡 + 操作）：`app/(admin)/classes/[id].tsx`
- 弹窗（含表单、防误关）：`app/(admin)/courses/index.tsx` 的 `NewItemModal`
- 读 + 写闭环：`students.ts` 的 `useApproveStudent` + 学员详情面板按钮

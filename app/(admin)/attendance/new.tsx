import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NewSessionForm } from '@/components/new-session-form';
import { DetailHeader, EmptyState, SCREEN_BG } from '@/components/ui/admin-kit';
import { useCohortDetail } from '@/lib/queries/classes';
import { useAdminLayout } from '../_layout';

// 独立「新建共修场次」页(窄屏 / 直达链接用;宽屏走出勤页内弹窗)。表单复用 components/new-session-form。
export default function NewSession() {
  const { setTitle } = useAdminLayout();
  const router = useRouter();
  const { cohortId } = useLocalSearchParams<{ cohortId: string }>();
  const { data: cohort } = useCohortDetail(cohortId);

  useEffect(() => { setTitle('新建共修场次'); }, [setTitle]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SCREEN_BG }} edges={['top']}>
      <DetailHeader title="新建共修场次" onBack={() => router.back()} backLabel="共修出勤" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {cohortId ? (
          <NewSessionForm cohortId={cohortId} cohortName={cohort?.name} programId={cohort?.programId} onDone={() => router.back()} />
        ) : (
          <View style={{ paddingVertical: 24 }}><EmptyState>请从某个班级的出勤页进入新建。</EmptyState></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

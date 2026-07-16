import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from '@/lib/types/database';

// 开发连 sss-dev,生产构建连 sss——由 .env 的 URL/KEY 决定,代码不写死。读写一律走 RLS。
// 环境变量见 .env(EXPO_PUBLIC_ 前缀才会注入客户端)。无 env 时回落占位值,保证预览构建/Expo Go 不崩(查询自然失败→兜底)。
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// 会话持久化(D-1 iOS 首发,2026-07-02):web 用 localStorage(supabase-js 默认),原生用 AsyncStorage——
// 之前原生留内存导致 App 重启即掉登录,iOS 首发下这是 P0。storage 只在原生传(web 传 AsyncStorage 反而绕一层)。
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { useDownloadStore } from '@/lib/download-store';
import { supabase } from '@/lib/supabase';

// 会话上下文。持久化 + 自动刷新 token 见 lib/supabase.ts(web=localStorage 默认,原生=AsyncStorage,
//   D-1 iOS 首发 2026-07-02 已修:此前原生留内存导致 App 重启即掉登录,这条注释此前过期未同步)。
type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // 登入/token 刷新 → 让所有查询用新 token 重取。
        //   修「会话过期后,课程/班级等需登录才读的数据被旧 token 读成空、又被缓存 → 看着像数据没了」。
        qc.invalidateQueries();
      } else if (event === 'SIGNED_OUT') {
        // A2审计发现(2026-07-13):invalidateQueries 只标脏待刷新,刷新完成前旧数据仍渲染在屏幕上——
        //   同设备换号登录时会闪现上一账号缓存(大量query key不带uid)。clear() 直接清空、组件退回
        //   初始态,没有旧数据可闪。下载列表(lib/download-store.ts)同理按URL存键不含用户ID,
        //   一并清空(该store早有clearAll(),此前登出流程从未调用过)。
        qc.clear();
        useDownloadStore.getState().clearAll();
      }
    });

    // web:标签页久置后回到前台,主动 getSession() —— 过期则刷新 token(→ TOKEN_REFRESHED → 上面重取)。
    let onVisible: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVisible = () => { if (document.visibilityState === 'visible') void supabase.auth.getSession(); };
      document.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      if (onVisible && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [qc]);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

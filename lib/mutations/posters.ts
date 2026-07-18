import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 月度画报存库(管理端·走 RLS home_posters_write = is_system_admin)。
//   有图 → upsert(year,month 唯一);清空图 → 删该月(image_url NOT NULL,空=该月没有画报,首页降级为渐变)。
// 第一步只接「图片链接(URL)」;App 内选图直传(Supabase Storage)第二步加。
export function useUpsertPoster() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { year: number; month: number; imageUrl: string | null; caption: string | null; isActive: boolean; accentColor: string | null; overlayOpacity: number | null }) => {
      const url = (p.imageUrl ?? '').trim();
      if (!url) {
        const { error } = await supabase.from('home_posters').delete().eq('year', p.year).eq('month', p.month);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('home_posters').upsert(
        {
          year: p.year,
          month: p.month,
          image_url: url,
          caption: p.caption?.trim() || null,
          is_active: p.isActive,
          accent_color: p.accentColor,
          overlay_opacity: p.overlayOpacity,
          created_by: session?.user.id ?? null,
        },
        { onConflict: 'year,month' },
      );
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['admin-posters', p.year] });
      qc.invalidateQueries({ queryKey: ['home-poster'] }); // 师兄端首页当月画报
    },
  });
}

// 设备选图 → 上传 posters 桶 → 返回公开链接(管理员;走 storage RLS:public 读 / is_system_admin 写)。
// 第二步:配合 expo-image-picker;选好图后把返回链接填回画报表单,再保存即落 home_posters。
export function useUploadPosterImage() {
  return useMutation({
    mutationFn: async (p: { uri: string; year: number; month: number; contentType?: string }): Promise<string> => {
      const res = await fetch(p.uri);
      const blob = await res.blob();
      const ct = p.contentType || blob.type || 'image/jpeg';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const path = `${p.year}/${p.month}-${Date.now()}.${ext}`; // 每月可多次替换,时间戳防覆盖缓存
      const { error } = await supabase.storage.from('posters').upload(path, blob, { contentType: ct, upsert: true });
      if (error) throw error;
      return supabase.storage.from('posters').getPublicUrl(path).data.publicUrl;
    },
  });
}

// ── 法会期(event)/特别日(special)画报(⑦·2026-07-11)────────────────────────
// 无固定数量,新增即插入;编辑传 id 则更新。同一张表 home_posters,poster_type 区分。
export function useUploadEventPosterImage() {
  return useMutation({
    mutationFn: async (p: { uri: string; posterType: 'event' | 'special'; contentType?: string }): Promise<string> => {
      const res = await fetch(p.uri);
      const blob = await res.blob();
      const ct = p.contentType || blob.type || 'image/jpeg';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const path = `${p.posterType}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('posters').upload(path, blob, { contentType: ct, upsert: true });
      if (error) throw error;
      return supabase.storage.from('posters').getPublicUrl(path).data.publicUrl;
    },
  });
}

export function useUpsertEventPoster() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id?: string;
      posterType: 'event' | 'special';
      startDate: string;
      endDate: string;
      imageUrl: string;
      caption: string | null;
      isActive: boolean;
      accentColor: string | null;
      overlayOpacity: number | null;
    }) => {
      const row = {
        poster_type: p.posterType,
        start_date: p.startDate,
        end_date: p.endDate,
        image_url: p.imageUrl.trim(),
        caption: p.caption?.trim() || null,
        is_active: p.isActive,
        accent_color: p.accentColor,
        overlay_opacity: p.overlayOpacity,
        created_by: session?.user.id ?? null,
      };
      if (p.id) {
        const { error } = await supabase.from('home_posters').update(row).eq('id', p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('home_posters').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['admin-event-posters', p.posterType] });
      qc.invalidateQueries({ queryKey: ['home-poster'] }); // 师兄端首页(命中日期段则替代当月画报)
    },
  });
}

export function useDeleteEventPoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; posterType: 'event' | 'special' }) => {
      const { error } = await supabase.from('home_posters').delete().eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['admin-event-posters', p.posterType] });
      qc.invalidateQueries({ queryKey: ['home-poster'] });
    },
  });
}

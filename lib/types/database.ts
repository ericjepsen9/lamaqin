// ⚠️ 自动生成 —— 由 scripts/gen-types-from-migrations.cjs 从 supabase/migrations/*.sql 解析(决策175)。
// 近似类型:覆盖全部表的列名 + 大致 TS 类型(含 NOT NULL / 数组 / 行内 CHECK 枚举);视图列宽松。
// 有库访问时可用官方 `supabase gen types typescript --project-id ubyzyadlzmtgxvbxanbr` 覆盖以求精确。
// 勿手改本文件——改迁移后重跑生成器。
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      academies: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          display_order: number | null;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name?: string;
          description?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      advancement_records: {
        Row: {
          id: string;
          user_id: string;
          from_cohort_id: string | null;
          to_cohort_id: string | null;
          decision: 'advanced' | 'graduated' | 'held_back' | 'other';
          decided_by: string | null;
          basis: string | null;
          decided_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          from_cohort_id?: string | null;
          to_cohort_id?: string | null;
          decision?: 'advanced' | 'graduated' | 'held_back' | 'other';
          decided_by?: string | null;
          basis?: string | null;
          decided_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          from_cohort_id?: string | null;
          to_cohort_id?: string | null;
          decision?: 'advanced' | 'graduated' | 'held_back' | 'other';
          decided_by?: string | null;
          basis?: string | null;
          decided_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      browse_item_categories: {
        Row: {
          item_id: string;
          category_id: string;
        };
        Insert: {
          item_id?: string;
          category_id?: string;
        };
        Update: {
          item_id?: string;
          category_id?: string;
        };
        Relationships: [];
      };
      browse_items: {
        Row: {
          id: string;
          kind: 'course' | 'talk';
          course_id: string | null;
          self_study_article_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          kind?: 'course' | 'talk';
          course_id?: string | null;
          self_study_article_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          kind?: 'course' | 'talk';
          course_id?: string | null;
          self_study_article_id?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      buddhist_days: {
        Row: {
          id: string;
          gregorian_date: string;
          day_type: 'auspicious' | 'blessing' | 'holiday';
          day_name: string;
          description: string | null;
          display_order: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          gregorian_date?: string;
          day_type?: 'auspicious' | 'blessing' | 'holiday';
          day_name?: string;
          description?: string | null;
          display_order?: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          gregorian_date?: string;
          day_type?: 'auspicious' | 'blessing' | 'holiday';
          day_name?: string;
          description?: string | null;
          display_order?: number;
          created_at?: string | null;
        };
        Relationships: [];
      };
      canon_blocks: {
        Row: {
          id: string;
          juan_id: string;
          block_order: number;
          block_type: 'heading' | 'verse' | 'body' | 'homage' | 'colophon' | 'toc';
          text: string;
          char_count: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          juan_id?: string;
          block_order?: number;
          block_type?: 'heading' | 'verse' | 'body' | 'homage' | 'colophon' | 'toc';
          text?: string;
          char_count?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          juan_id?: string;
          block_order?: number;
          block_type?: 'heading' | 'verse' | 'body' | 'homage' | 'colophon' | 'toc';
          text?: string;
          char_count?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      canon_divisions: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          level: 'pitaka' | 'division';
          sort_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          level?: 'pitaka' | 'division';
          sort_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          level?: 'pitaka' | 'division';
          sort_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      canon_juan: {
        Row: {
          id: string;
          work_id: string;
          seq: number;
          title: string | null;
          juan_label: string | null;
          char_count: number | null;
          source_file: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          work_id?: string;
          seq?: number;
          title?: string | null;
          juan_label?: string | null;
          char_count?: number | null;
          source_file?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          work_id?: string;
          seq?: number;
          title?: string | null;
          juan_label?: string | null;
          char_count?: number | null;
          source_file?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      canon_works: {
        Row: {
          id: string;
          division_id: string;
          title: string;
          slug: string;
          work_no: string | null;
          volume_no: string | null;
          fascicle_no: string | null;
          dynasty: string | null;
          author: string | null;
          translator: string | null;
          attribution_raw: string | null;
          juan_count: number | null;
          sort_order: number | null;
          is_published: boolean | null;
          source_dirs: (string)[] | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          division_id?: string;
          title?: string;
          slug?: string;
          work_no?: string | null;
          volume_no?: string | null;
          fascicle_no?: string | null;
          dynasty?: string | null;
          author?: string | null;
          translator?: string | null;
          attribution_raw?: string | null;
          juan_count?: number | null;
          sort_order?: number | null;
          is_published?: boolean | null;
          source_dirs?: (string)[] | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          division_id?: string;
          title?: string;
          slug?: string;
          work_no?: string | null;
          volume_no?: string | null;
          fascicle_no?: string | null;
          dynasty?: string | null;
          author?: string | null;
          translator?: string | null;
          attribution_raw?: string | null;
          juan_count?: number | null;
          sort_order?: number | null;
          is_published?: boolean | null;
          source_dirs?: (string)[] | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      care_followups: {
        Row: {
          id: string;
          student_id: string;
          cohort_id: string;
          care_worker_id: string;
          contacted_at: string;
          summary: string;
          follow_up_status: string | null;
          created_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          student_id?: string;
          cohort_id?: string;
          care_worker_id?: string;
          contacted_at?: string;
          summary?: string;
          follow_up_status?: string | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          student_id?: string;
          cohort_id?: string;
          care_worker_id?: string;
          contacted_at?: string;
          summary?: string;
          follow_up_status?: string | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          level: 'tier' | 'sub';
          is_public: boolean;
          study_program_id: string | null;
          display_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          level?: 'tier' | 'sub';
          is_public?: boolean;
          study_program_id?: string | null;
          display_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          level?: 'tier' | 'sub';
          is_public?: boolean;
          study_program_id?: string | null;
          display_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      class_admins: {
        Row: {
          cohort_id: string;
          user_id: string;
          role: 'zhumai' | 'aixin';
          assigned_at: string | null;
          assigned_by: string | null;
        };
        Insert: {
          cohort_id?: string;
          user_id?: string;
          role?: 'zhumai' | 'aixin';
          assigned_at?: string | null;
          assigned_by?: string | null;
        };
        Update: {
          cohort_id?: string;
          user_id?: string;
          role?: 'zhumai' | 'aixin';
          assigned_at?: string | null;
          assigned_by?: string | null;
        };
        Relationships: [];
      };
      class_members: {
        Row: {
          cohort_id: string;
          user_id: string;
          status: 'active' | 'paused' | 'held_back' | 'graduated' | 'left';
          member_role: 'auditor' | 'formal';
          current_semester: number | null;
          held_back_count: number | null;
          is_primary: boolean | null;
          joined_at: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_change_reason: string | null;
          graduated_at: string | null;
        };
        Insert: {
          cohort_id?: string;
          user_id?: string;
          status?: 'active' | 'paused' | 'held_back' | 'graduated' | 'left';
          member_role?: 'auditor' | 'formal';
          current_semester?: number | null;
          held_back_count?: number | null;
          is_primary?: boolean | null;
          joined_at?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_change_reason?: string | null;
          graduated_at?: string | null;
        };
        Update: {
          cohort_id?: string;
          user_id?: string;
          status?: 'active' | 'paused' | 'held_back' | 'graduated' | 'left';
          member_role?: 'auditor' | 'formal';
          current_semester?: number | null;
          held_back_count?: number | null;
          is_primary?: boolean | null;
          joined_at?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_change_reason?: string | null;
          graduated_at?: string | null;
        };
        Relationships: [];
      };
      cohort_announcements: {
        Row: {
          id: string;
          cohort_id: string;
          title: string | null;
          content: string;
          is_pinned: boolean | null;
          posted_at: string | null;
          posted_by: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string;
          title?: string | null;
          content?: string;
          is_pinned?: boolean | null;
          posted_at?: string | null;
          posted_by?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          title?: string | null;
          content?: string;
          is_pinned?: boolean | null;
          posted_at?: string | null;
          posted_by?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      cohort_extra_lessons: {
        Row: {
          id: string;
          cohort_id: string;
          lesson_id: string;
          program_week_id: string;
          create_group_session: boolean;
          reason: string | null;
          created_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string;
          lesson_id?: string;
          program_week_id?: string;
          create_group_session?: boolean;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          lesson_id?: string;
          program_week_id?: string;
          create_group_session?: boolean;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      cohort_lag_snapshot: {
        Row: {
          cohort_id: string;
          user_id: string;
          attendance_lag: number | null;
          task_lag: number | null;
          content_lag: number | null;
          quiz_lag: number | null;
          meditation_lag: number | null;
          computed_at: string | null;
        };
        Insert: {
          cohort_id?: string;
          user_id?: string;
          attendance_lag?: number | null;
          task_lag?: number | null;
          content_lag?: number | null;
          quiz_lag?: number | null;
          meditation_lag?: number | null;
          computed_at?: string | null;
        };
        Update: {
          cohort_id?: string;
          user_id?: string;
          attendance_lag?: number | null;
          task_lag?: number | null;
          content_lag?: number | null;
          quiz_lag?: number | null;
          meditation_lag?: number | null;
          computed_at?: string | null;
        };
        Relationships: [];
      };
      cohort_recommended_templates: {
        Row: {
          cohort_id: string | null;
          template_id: string | null;
          binding: 'auto' | 'recommended';
          display_order: number | null;
        };
        Insert: {
          cohort_id?: string | null;
          template_id?: string | null;
          binding?: 'auto' | 'recommended';
          display_order?: number | null;
        };
        Update: {
          cohort_id?: string | null;
          template_id?: string | null;
          binding?: 'auto' | 'recommended';
          display_order?: number | null;
        };
        Relationships: [];
      };
      cohort_rest_weeks: {
        Row: {
          id: string;
          cohort_id: string;
          rest_start_date: string;
          reason: string | null;
          created_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string;
          rest_start_date?: string;
          reason?: string | null;
          created_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          rest_start_date?: string;
          reason?: string | null;
          created_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      cohort_weekly_practice_summaries: {
        Row: {
          id: string;
          cohort_id: string;
          week_id: string;
          week_start_date: string;
          week_end_date: string;
          summary_data: Json;
          generated_at: string | null;
          shared_at: string | null;
          shared_by: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string;
          week_id?: string;
          week_start_date?: string;
          week_end_date?: string;
          summary_data?: Json;
          generated_at?: string | null;
          shared_at?: string | null;
          shared_by?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          week_id?: string;
          week_start_date?: string;
          week_end_date?: string;
          summary_data?: Json;
          generated_at?: string | null;
          shared_at?: string | null;
          shared_by?: string | null;
        };
        Relationships: [];
      };
      cohorts: {
        Row: {
          id: string;
          program_id: string;
          name: string;
          code: string;
          start_date: string;
          timezone: string;
          end_date: string | null;
          is_active: boolean | null;
          notes: string | null;
          weekly_cosession_dow: number | null;
          weekly_cosession_time: string | null;
          cosession_zoom_url: string | null;
          practice_cosession_dow: number | null;
          practice_cosession_time: string | null;
          practice_cosession_zoom_url: string | null;
          neijiaxing_lock_years: number;
          neijiaxing_ext_years: number;
          created_at: string | null;
          reminder_enabled: boolean | null;
          reminder_weekday: number | null;
          reminder_time: string | null;
          reminder_message: string | null;
          reminder_last_sent_date: string | null;
        };
        Insert: {
          id?: string;
          program_id?: string;
          name?: string;
          code?: string;
          start_date?: string;
          timezone?: string;
          end_date?: string | null;
          is_active?: boolean | null;
          notes?: string | null;
          weekly_cosession_dow?: number | null;
          weekly_cosession_time?: string | null;
          cosession_zoom_url?: string | null;
          practice_cosession_dow?: number | null;
          practice_cosession_time?: string | null;
          practice_cosession_zoom_url?: string | null;
          neijiaxing_lock_years?: number;
          neijiaxing_ext_years?: number;
          created_at?: string | null;
          reminder_enabled?: boolean | null;
          reminder_weekday?: number | null;
          reminder_time?: string | null;
          reminder_message?: string | null;
          reminder_last_sent_date?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          name?: string;
          code?: string;
          start_date?: string;
          timezone?: string;
          end_date?: string | null;
          is_active?: boolean | null;
          notes?: string | null;
          weekly_cosession_dow?: number | null;
          weekly_cosession_time?: string | null;
          cosession_zoom_url?: string | null;
          practice_cosession_dow?: number | null;
          practice_cosession_time?: string | null;
          practice_cosession_zoom_url?: string | null;
          neijiaxing_lock_years?: number;
          neijiaxing_ext_years?: number;
          created_at?: string | null;
          reminder_enabled?: boolean | null;
          reminder_weekday?: number | null;
          reminder_time?: string | null;
          reminder_message?: string | null;
          reminder_last_sent_date?: string | null;
        };
        Relationships: [];
      };
      course_chapters: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          display_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          course_id?: string;
          title?: string;
          display_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          course_id?: string;
          title?: string;
          display_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      course_lessons: {
        Row: {
          id: string;
          course_id: string;
          lesson_number: number;
          title: string;
          source_text: string | null;
          display_order: number | null;
          created_at: string | null;
          chapter_id: string | null;
        };
        Insert: {
          id?: string;
          course_id?: string;
          lesson_number?: number;
          title?: string;
          source_text?: string | null;
          display_order?: number | null;
          created_at?: string | null;
          chapter_id?: string | null;
        };
        Update: {
          id?: string;
          course_id?: string;
          lesson_number?: number;
          title?: string;
          source_text?: string | null;
          display_order?: number | null;
          created_at?: string | null;
          chapter_id?: string | null;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          name: string;
          slug: string;
          total_lessons: number | null;
          author: string | null;
          description: string | null;
          is_required: boolean | null;
          created_at: string | null;
          course_type: string | null;
          cover_image_url: string | null;
          text_id: string | null;
          version_year: number | null;
          cover_accent_color: string | null;
          translator: string | null;
          author_role: string | null;
          compiler: string | null;
        };
        Insert: {
          id?: string;
          name?: string;
          slug?: string;
          total_lessons?: number | null;
          author?: string | null;
          description?: string | null;
          is_required?: boolean | null;
          created_at?: string | null;
          course_type?: string | null;
          cover_image_url?: string | null;
          text_id?: string | null;
          version_year?: number | null;
          cover_accent_color?: string | null;
          translator?: string | null;
          author_role?: string | null;
          compiler?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          total_lessons?: number | null;
          author?: string | null;
          description?: string | null;
          is_required?: boolean | null;
          created_at?: string | null;
          course_type?: string | null;
          cover_image_url?: string | null;
          text_id?: string | null;
          version_year?: number | null;
          cover_accent_color?: string | null;
          translator?: string | null;
          author_role?: string | null;
          compiler?: string | null;
        };
        Relationships: [];
      };
      daily_practice_journals: {
        Row: {
          id: string;
          user_id: string;
          cohort_id: string | null;
          journal_date: string;
          content: string;
          visibility: 'private' | 'visible_to_zhumai' | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          cohort_id?: string | null;
          journal_date?: string;
          content?: string;
          visibility?: 'private' | 'visible_to_zhumai' | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          cohort_id?: string | null;
          journal_date?: string;
          content?: string;
          visibility?: 'private' | 'visible_to_zhumai' | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      daily_rituals: {
        Row: {
          user_id: string;
          ritual_date: string;
          faxin_at: string | null;
          huixiang_at: string | null;
        };
        Insert: {
          user_id?: string;
          ritual_date?: string;
          faxin_at?: string | null;
          huixiang_at?: string | null;
        };
        Update: {
          user_id?: string;
          ritual_date?: string;
          faxin_at?: string | null;
          huixiang_at?: string | null;
        };
        Relationships: [];
      };
      dharma_assemblies: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          description: string | null;
          cover_image_url: string | null;
          start_tib_month: number;
          start_tib_day: number;
          end_tib_month: number;
          end_tib_day: number;
          is_active: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          slug?: string | null;
          description?: string | null;
          cover_image_url?: string | null;
          start_tib_month?: number;
          start_tib_day?: number;
          end_tib_month?: number;
          end_tib_day?: number;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          description?: string | null;
          cover_image_url?: string | null;
          start_tib_month?: number;
          start_tib_day?: number;
          end_tib_month?: number;
          end_tib_day?: number;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      dharma_qa_queries: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          result_count: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          query?: string;
          result_count?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          query?: string;
          result_count?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      event_sessions: {
        Row: {
          id: string;
          event_id: string;
          session_date: string;
          start_time: string | null;
          end_time: string | null;
          title: string | null;
          mode: 'online' | 'offline' | 'hybrid';
          online_url: string | null;
          location: string | null;
          display_order: number | null;
          created_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          event_id?: string;
          session_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          title?: string | null;
          mode?: 'online' | 'offline' | 'hybrid';
          online_url?: string | null;
          location?: string | null;
          display_order?: number | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          session_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          title?: string | null;
          mode?: 'online' | 'offline' | 'hybrid';
          online_url?: string | null;
          location?: string | null;
          display_order?: number | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          name: string;
          event_type: string;
          start_date: string;
          end_date: string;
          description: string | null;
          cover_image_url: string | null;
          is_active: boolean | null;
          created_by: string | null;
          created_at: string | null;
          default_practice_id: string | null;
          default_target_count: number | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          name?: string;
          event_type?: string;
          start_date?: string;
          end_date?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          default_practice_id?: string | null;
          default_target_count?: number | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          event_type?: string;
          start_date?: string;
          end_date?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          default_practice_id?: string | null;
          default_target_count?: number | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      exam_grades: {
        Row: {
          id: string;
          user_id: string;
          program_id: string | null;
          exam_name: string;
          score: number | null;
          is_pass: boolean | null;
          recorded_by: string | null;
          recorded_at: string | null;
          notes: string | null;
          exam_format: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          program_id?: string | null;
          exam_name?: string;
          score?: number | null;
          is_pass?: boolean | null;
          recorded_by?: string | null;
          recorded_at?: string | null;
          notes?: string | null;
          exam_format?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_id?: string | null;
          exam_name?: string;
          score?: number | null;
          is_pass?: boolean | null;
          recorded_by?: string | null;
          recorded_at?: string | null;
          notes?: string | null;
          exam_format?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          type: 'bug' | 'suggestion' | 'text_correction' | 'other';
          content: string;
          status: 'open' | 'reviewing' | 'resolved' | 'closed' | null;
          created_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          type?: 'bug' | 'suggestion' | 'text_correction' | 'other';
          content?: string;
          status?: 'open' | 'reviewing' | 'resolved' | 'closed' | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'bug' | 'suggestion' | 'text_correction' | 'other';
          content?: string;
          status?: 'open' | 'reviewing' | 'resolved' | 'closed' | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      group_sessions: {
        Row: {
          id: string;
          cohort_id: string;
          lesson_id: string;
          scheduled_at: string;
          session_end_at: string;
          cosession_type: 'regular' | 'practice';
          location: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string | null;
          tracks_attendance: boolean | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string;
          lesson_id?: string;
          scheduled_at?: string;
          session_end_at?: string;
          cosession_type?: 'regular' | 'practice';
          location?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          tracks_attendance?: boolean | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          lesson_id?: string;
          scheduled_at?: string;
          session_end_at?: string;
          cosession_type?: 'regular' | 'practice';
          location?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          tracks_attendance?: boolean | null;
        };
        Relationships: [];
      };
      home_banners: {
        Row: {
          id: string;
          title: string;
          image_url: string | null;
          link: string | null;
          start_date: string | null;
          end_date: string | null;
          is_active: boolean | null;
          display_order: number | null;
          created_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          title?: string;
          image_url?: string | null;
          link?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean | null;
          display_order?: number | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          image_url?: string | null;
          link?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean | null;
          display_order?: number | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      home_posters: {
        Row: {
          id: string;
          year: number;
          month: number;
          image_url: string;
          caption: string | null;
          is_active: boolean | null;
          display_order: number | null;
          created_by: string | null;
          created_at: string | null;
          poster_type: string | null;
          start_date: string | null;
          end_date: string | null;
        };
        Insert: {
          id?: string;
          year?: number;
          month?: number;
          image_url?: string;
          caption?: string | null;
          is_active?: boolean | null;
          display_order?: number | null;
          created_by?: string | null;
          created_at?: string | null;
          poster_type?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        };
        Update: {
          id?: string;
          year?: number;
          month?: number;
          image_url?: string;
          caption?: string | null;
          is_active?: boolean | null;
          display_order?: number | null;
          created_by?: string | null;
          created_at?: string | null;
          poster_type?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        };
        Relationships: [];
      };
      lesson_blocks: {
        Row: {
          id: string;
          lesson_id: string;
          lesson_resource_id: string | null;
          block_order: number;
          block_type: 'title' | 'homage' | 'kepan' | 'inline_heading' | 'body' | 'verse' | 'question' | 'aspiration' | 'dedication' | 'footnote';
          text: string | null;
          kepan_mark: string | null;
          kepan_level: number | null;
          kepan_title: string | null;
          kepan_split: string | null;
          kepan_path: Json | null;
          kepan_source: string | null;
          heading_mark: string | null;
          heading_level: number | null;
          question_number: number | null;
          footnote_ref: number | null;
          text_layer: 'sutra' | 'root' | 'commentary' | 'teaching' | 'variant' | null;
          quotes: Json | null;
          author: string | null;
          confidence: 'high' | 'low' | null;
          source_doc: string | null;
          created_at: string | null;
          ts: string | null;
          image_url: string | null;
        };
        Insert: {
          id?: string;
          lesson_id?: string;
          lesson_resource_id?: string | null;
          block_order?: number;
          block_type?: 'title' | 'homage' | 'kepan' | 'inline_heading' | 'body' | 'verse' | 'question' | 'aspiration' | 'dedication' | 'footnote';
          text?: string | null;
          kepan_mark?: string | null;
          kepan_level?: number | null;
          kepan_title?: string | null;
          kepan_split?: string | null;
          kepan_path?: Json | null;
          kepan_source?: string | null;
          heading_mark?: string | null;
          heading_level?: number | null;
          question_number?: number | null;
          footnote_ref?: number | null;
          text_layer?: 'sutra' | 'root' | 'commentary' | 'teaching' | 'variant' | null;
          quotes?: Json | null;
          author?: string | null;
          confidence?: 'high' | 'low' | null;
          source_doc?: string | null;
          created_at?: string | null;
          ts?: string | null;
          image_url?: string | null;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          lesson_resource_id?: string | null;
          block_order?: number;
          block_type?: 'title' | 'homage' | 'kepan' | 'inline_heading' | 'body' | 'verse' | 'question' | 'aspiration' | 'dedication' | 'footnote';
          text?: string | null;
          kepan_mark?: string | null;
          kepan_level?: number | null;
          kepan_title?: string | null;
          kepan_split?: string | null;
          kepan_path?: Json | null;
          kepan_source?: string | null;
          heading_mark?: string | null;
          heading_level?: number | null;
          question_number?: number | null;
          footnote_ref?: number | null;
          text_layer?: 'sutra' | 'root' | 'commentary' | 'teaching' | 'variant' | null;
          quotes?: Json | null;
          author?: string | null;
          confidence?: 'high' | 'low' | null;
          source_doc?: string | null;
          created_at?: string | null;
          ts?: string | null;
          image_url?: string | null;
        };
        Relationships: [];
      };
      lesson_resources: {
        Row: {
          id: string;
          lesson_id: string;
          speaker_name: string;
          video_url: string | null;
          audio_url: string | null;
          download_url: string | null;
          notes: string | null;
          sort_order: number | null;
          created_at: string | null;
          covers_lessons: (number)[] | null;
          slide_image_urls: (string)[] | null;
        };
        Insert: {
          id?: string;
          lesson_id?: string;
          speaker_name?: string;
          video_url?: string | null;
          audio_url?: string | null;
          download_url?: string | null;
          notes?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          covers_lessons?: (number)[] | null;
          slide_image_urls?: (string)[] | null;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          speaker_name?: string;
          video_url?: string | null;
          audio_url?: string | null;
          download_url?: string | null;
          notes?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          covers_lessons?: (number)[] | null;
          slide_image_urls?: (string)[] | null;
        };
        Relationships: [];
      };
      meditation_sessions: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string | null;
          duration_minutes: number;
          created_at: string;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          lesson_id?: string | null;
          duration_minutes?: number;
          created_at?: string;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          lesson_id?: string | null;
          duration_minutes?: number;
          created_at?: string;
          client_token?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          category: 'study' | 'class' | 'event' | 'system';
          title: string;
          body: string;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          category?: 'study' | 'class' | 'event' | 'system';
          title?: string;
          body?: string;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: 'study' | 'class' | 'event' | 'system';
          title?: string;
          body?: string;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      personal_self_study_records: {
        Row: {
          id: string;
          user_id: string;
          book_id: string;
          article_id: string;
          status: 'not_started' | 'reading' | 'completed' | 'paused' | null;
          started_at: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          watched_at: string | null;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          book_id?: string;
          article_id?: string;
          status?: 'not_started' | 'reading' | 'completed' | 'paused' | null;
          started_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          watched_at?: string | null;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          book_id?: string;
          article_id?: string;
          status?: 'not_started' | 'reading' | 'completed' | 'paused' | null;
          started_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          watched_at?: string | null;
          read_at?: string | null;
        };
        Relationships: [];
      };
      personal_study_records: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          study_type: 'listen' | 'read_notes';
          lesson_resource_id: string | null;
          study_date: string;
          notes: string | null;
          created_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          lesson_id?: string;
          study_type?: 'listen' | 'read_notes';
          lesson_resource_id?: string | null;
          study_date?: string;
          notes?: string | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          lesson_id?: string;
          study_type?: 'listen' | 'read_notes';
          lesson_resource_id?: string | null;
          study_date?: string;
          notes?: string | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      practice_appointments: {
        Row: {
          id: string;
          initiator_id: string;
          practice_id: string | null;
          title: string;
          target_count: number | null;
          scheduled_date: string | null;
          end_date: string | null;
          description: string | null;
          scope: 'cohort' | 'society' | null;
          cohort_id: string | null;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          initiator_id?: string;
          practice_id?: string | null;
          title?: string;
          target_count?: number | null;
          scheduled_date?: string | null;
          end_date?: string | null;
          description?: string | null;
          scope?: 'cohort' | 'society' | null;
          cohort_id?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          initiator_id?: string;
          practice_id?: string | null;
          title?: string;
          target_count?: number | null;
          scheduled_date?: string | null;
          end_date?: string | null;
          description?: string | null;
          scope?: 'cohort' | 'society' | null;
          cohort_id?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      practice_contents: {
        Row: {
          id: string;
          practice_id: string;
          content_number: number | null;
          title: string;
          category: string | null;
          description: string | null;
          reference_book: string | null;
          display_order: number | null;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          practice_id?: string;
          content_number?: number | null;
          title?: string;
          category?: string | null;
          description?: string | null;
          reference_book?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          practice_id?: string;
          content_number?: number | null;
          title?: string;
          category?: string | null;
          description?: string | null;
          reference_book?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      practice_guides: {
        Row: {
          id: string;
          practice_id: string;
          content_number: number | null;
          video_url: string | null;
          audio_url: string | null;
          guide_text: string | null;
          sort_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          practice_id?: string;
          content_number?: number | null;
          video_url?: string | null;
          audio_url?: string | null;
          guide_text?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          practice_id?: string;
          content_number?: number | null;
          video_url?: string | null;
          audio_url?: string | null;
          guide_text?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      practice_logs: {
        Row: {
          id: string;
          user_id: string;
          vow_id: string;
          count: number | null;
          duration_minutes: number | null;
          session_count: number | null;
          session_attempt: number | null;
          practice_content_id: string | null;
          reflection: string | null;
          reflection_at: string | null;
          log_date: string;
          log_time: string | null;
          notes: string | null;
          created_at: string | null;
          is_confirmed: boolean | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          min_session_minutes_at_log: number | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          vow_id?: string;
          count?: number | null;
          duration_minutes?: number | null;
          session_count?: number | null;
          session_attempt?: number | null;
          practice_content_id?: string | null;
          reflection?: string | null;
          reflection_at?: string | null;
          log_date?: string;
          log_time?: string | null;
          notes?: string | null;
          created_at?: string | null;
          is_confirmed?: boolean | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          min_session_minutes_at_log?: number | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          vow_id?: string;
          count?: number | null;
          duration_minutes?: number | null;
          session_count?: number | null;
          session_attempt?: number | null;
          practice_content_id?: string | null;
          reflection?: string | null;
          reflection_at?: string | null;
          log_date?: string;
          log_time?: string | null;
          notes?: string | null;
          created_at?: string | null;
          is_confirmed?: boolean | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          min_session_minutes_at_log?: number | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      practice_templates: {
        Row: {
          id: string;
          practice_id: string;
          template_name: string;
          description: string | null;
          target_count: number | null;
          target_period: 'lifetime' | 'until_complete' | 'daily' | 'weekly' | 'event';
          default_daily_target: number | null;
          default_weekly_target: number | null;
          pace_level: string | null;
          starts_offset_days: number | null;
          duration_days: number | null;
          applies_to_programs: (string)[] | null;
          can_substitute: boolean;
          substitute_practice_id: string | null;
          substitute_count: number | null;
          is_active: boolean | null;
          display_order: number | null;
          created_by: string | null;
          created_at: string | null;
          is_time_limited: boolean | null;
          default_min_session_minutes: number | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          practice_id?: string;
          template_name?: string;
          description?: string | null;
          target_count?: number | null;
          target_period?: 'lifetime' | 'until_complete' | 'daily' | 'weekly' | 'event';
          default_daily_target?: number | null;
          default_weekly_target?: number | null;
          pace_level?: string | null;
          starts_offset_days?: number | null;
          duration_days?: number | null;
          applies_to_programs?: (string)[] | null;
          can_substitute?: boolean;
          substitute_practice_id?: string | null;
          substitute_count?: number | null;
          is_active?: boolean | null;
          display_order?: number | null;
          created_by?: string | null;
          created_at?: string | null;
          is_time_limited?: boolean | null;
          default_min_session_minutes?: number | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          practice_id?: string;
          template_name?: string;
          description?: string | null;
          target_count?: number | null;
          target_period?: 'lifetime' | 'until_complete' | 'daily' | 'weekly' | 'event';
          default_daily_target?: number | null;
          default_weekly_target?: number | null;
          pace_level?: string | null;
          starts_offset_days?: number | null;
          duration_days?: number | null;
          applies_to_programs?: (string)[] | null;
          can_substitute?: boolean;
          substitute_practice_id?: string | null;
          substitute_count?: number | null;
          is_active?: boolean | null;
          display_order?: number | null;
          created_by?: string | null;
          created_at?: string | null;
          is_time_limited?: boolean | null;
          default_min_session_minutes?: number | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      practices: {
        Row: {
          id: string;
          name: string;
          measurement: 'count' | 'duration';
          category: string | null;
          unit: string;
          description: string | null;
          display_order: number | null;
          is_active: boolean | null;
          created_at: string | null;
          session_mode: string | null;
          allowed_daily_targets: (number)[] | null;
          daily_target_locked: boolean | null;
          self_study_daily_target_locked: boolean | null;
          self_study_allowed_daily_targets: (number)[] | null;
        };
        Insert: {
          id?: string;
          name?: string;
          measurement?: 'count' | 'duration';
          category?: string | null;
          unit?: string;
          description?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
          session_mode?: string | null;
          allowed_daily_targets?: (number)[] | null;
          daily_target_locked?: boolean | null;
          self_study_daily_target_locked?: boolean | null;
          self_study_allowed_daily_targets?: (number)[] | null;
        };
        Update: {
          id?: string;
          name?: string;
          measurement?: 'count' | 'duration';
          category?: string | null;
          unit?: string;
          description?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
          session_mode?: string | null;
          allowed_daily_targets?: (number)[] | null;
          daily_target_locked?: boolean | null;
          self_study_daily_target_locked?: boolean | null;
          self_study_allowed_daily_targets?: (number)[] | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          student_id: string | null;
          email: string;
          full_name: string | null;
          dharma_name: string | null;
          phone: string | null;
          status: 'pending' | 'active' | 'rejected' | 'suspended' | 'inactive' | 'graduated';
          preferred_region: 'cn' | 'tw' | 'hk' | null;
          primary_cohort_id: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          accessibility_needs: (string)[] | null;
          data_source: 'self_register' | 'imported' | 'admin_created';
          learning_mode: 'class' | 'self_study' | 'both';
          created_at: string | null;
          updated_at: string | null;
          intended_program_id: string | null;
          deletion_requested_at: string | null;
          welcome_seen_at: string | null;
          must_change_password: boolean | null;
        };
        Insert: {
          id?: string;
          student_id?: string | null;
          email?: string;
          full_name?: string | null;
          dharma_name?: string | null;
          phone?: string | null;
          status?: 'pending' | 'active' | 'rejected' | 'suspended' | 'inactive' | 'graduated';
          preferred_region?: 'cn' | 'tw' | 'hk' | null;
          primary_cohort_id?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          accessibility_needs?: (string)[] | null;
          data_source?: 'self_register' | 'imported' | 'admin_created';
          learning_mode?: 'class' | 'self_study' | 'both';
          created_at?: string | null;
          updated_at?: string | null;
          intended_program_id?: string | null;
          deletion_requested_at?: string | null;
          welcome_seen_at?: string | null;
          must_change_password?: boolean | null;
        };
        Update: {
          id?: string;
          student_id?: string | null;
          email?: string;
          full_name?: string | null;
          dharma_name?: string | null;
          phone?: string | null;
          status?: 'pending' | 'active' | 'rejected' | 'suspended' | 'inactive' | 'graduated';
          preferred_region?: 'cn' | 'tw' | 'hk' | null;
          primary_cohort_id?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          accessibility_needs?: (string)[] | null;
          data_source?: 'self_register' | 'imported' | 'admin_created';
          learning_mode?: 'class' | 'self_study' | 'both';
          created_at?: string | null;
          updated_at?: string | null;
          intended_program_id?: string | null;
          deletion_requested_at?: string | null;
          welcome_seen_at?: string | null;
          must_change_password?: boolean | null;
        };
        Relationships: [];
      };
      program_courses: {
        Row: {
          program_id: string;
          course_id: string;
          sort_order: number | null;
        };
        Insert: {
          program_id?: string;
          course_id?: string;
          sort_order?: number | null;
        };
        Update: {
          program_id?: string;
          course_id?: string;
          sort_order?: number | null;
        };
        Relationships: [];
      };
      program_optional_practices: {
        Row: {
          id: string;
          program_id: string;
          practice_id: string;
          display_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          program_id?: string;
          practice_id?: string;
          display_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          practice_id?: string;
          display_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      program_required_transmissions: {
        Row: {
          program_id: string;
          transmission_id: string;
        };
        Insert: {
          program_id?: string;
          transmission_id?: string;
        };
        Update: {
          program_id?: string;
          transmission_id?: string;
        };
        Relationships: [];
      };
      program_semesters: {
        Row: {
          id: string;
          program_id: string;
          semester_number: number;
          semester_name: string;
          starts_week: number;
          ends_week: number;
        };
        Insert: {
          id?: string;
          program_id?: string;
          semester_number?: number;
          semester_name?: string;
          starts_week?: number;
          ends_week?: number;
        };
        Update: {
          id?: string;
          program_id?: string;
          semester_number?: number;
          semester_name?: string;
          starts_week?: number;
          ends_week?: number;
        };
        Relationships: [];
      };
      program_study_types: {
        Row: {
          program_id: string;
          study_type: 'listen' | 'read_notes' | 'speaking_present' | 'speaking_question' | 'speaking_observe' | 'group_attend' | 'group_absent' | 'group_review' | 'group_summary';
          requirement: 'required' | 'recommended';
          display_order: number | null;
          display_label: string;
        };
        Insert: {
          program_id?: string;
          study_type?: 'listen' | 'read_notes' | 'speaking_present' | 'speaking_question' | 'speaking_observe' | 'group_attend' | 'group_absent' | 'group_review' | 'group_summary';
          requirement?: 'required' | 'recommended';
          display_order?: number | null;
          display_label?: string;
        };
        Update: {
          program_id?: string;
          study_type?: 'listen' | 'read_notes' | 'speaking_present' | 'speaking_question' | 'speaking_observe' | 'group_attend' | 'group_absent' | 'group_review' | 'group_summary';
          requirement?: 'required' | 'recommended';
          display_order?: number | null;
          display_label?: string;
        };
        Relationships: [];
      };
      program_week_courses: {
        Row: {
          id: string;
          week_id: string;
          course_id: string;
          lesson_id: string | null;
          display_order: number | null;
        };
        Insert: {
          id?: string;
          week_id?: string;
          course_id?: string;
          lesson_id?: string | null;
          display_order?: number | null;
        };
        Update: {
          id?: string;
          week_id?: string;
          course_id?: string;
          lesson_id?: string | null;
          display_order?: number | null;
        };
        Relationships: [];
      };
      program_week_practices: {
        Row: {
          id: string;
          week_id: string;
          practice_id: string;
          practice_content_id: string | null;
          display_order: number | null;
          notes: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          week_id?: string;
          practice_id?: string;
          practice_content_id?: string | null;
          display_order?: number | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          week_id?: string;
          practice_id?: string;
          practice_content_id?: string | null;
          display_order?: number | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      program_week_self_study: {
        Row: {
          week_id: string | null;
          book_id: string | null;
        };
        Insert: {
          week_id?: string | null;
          book_id?: string | null;
        };
        Update: {
          week_id?: string | null;
          book_id?: string | null;
        };
        Relationships: [];
      };
      program_weeks: {
        Row: {
          id: string;
          program_id: string;
          semester_id: string;
          week_number: number;
          offset_days: number;
          category: string | null;
          is_holiday: boolean | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          program_id?: string;
          semester_id?: string;
          week_number?: number;
          offset_days?: number;
          category?: string | null;
          is_holiday?: boolean | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          program_id?: string;
          semester_id?: string;
          week_number?: number;
          offset_days?: number;
          category?: string | null;
          is_holiday?: boolean | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      programs: {
        Row: {
          id: string;
          academy_id: string | null;
          name: string;
          code: string;
          description: string | null;
          total_semesters: number | null;
          weeks_per_semester: number | null;
          start_semester: number;
          display_order: number | null;
          is_active: boolean | null;
          created_at: string | null;
          default_weekly_lessons: number | null;
          neijiaxing_lock_years: number | null;
        };
        Insert: {
          id?: string;
          academy_id?: string | null;
          name?: string;
          code?: string;
          description?: string | null;
          total_semesters?: number | null;
          weeks_per_semester?: number | null;
          start_semester?: number;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
          default_weekly_lessons?: number | null;
          neijiaxing_lock_years?: number | null;
        };
        Update: {
          id?: string;
          academy_id?: string | null;
          name?: string;
          code?: string;
          description?: string | null;
          total_semesters?: number | null;
          weeks_per_semester?: number | null;
          start_semester?: number;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
          default_weekly_lessons?: number | null;
          neijiaxing_lock_years?: number | null;
        };
        Relationships: [];
      };
      proxy_action_records: {
        Row: {
          id: string;
          user_id: string;
          action_type: 'substitute' | 'recognize' | 'exempt';
          admin_id: string | null;
          target_kind: 'vow' | 'lesson' | 'transmission' | 'exam' | 'advancement' | 'other';
          target_ref: string | null;
          target_note: string | null;
          substitute_practice_id: string | null;
          substitute_count: number | null;
          reason: string;
          basis: string | null;
          created_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          action_type?: 'substitute' | 'recognize' | 'exempt';
          admin_id?: string | null;
          target_kind?: 'vow' | 'lesson' | 'transmission' | 'exam' | 'advancement' | 'other';
          target_ref?: string | null;
          target_note?: string | null;
          substitute_practice_id?: string | null;
          substitute_count?: number | null;
          reason?: string;
          basis?: string | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          action_type?: 'substitute' | 'recognize' | 'exempt';
          admin_id?: string | null;
          target_kind?: 'vow' | 'lesson' | 'transmission' | 'exam' | 'advancement' | 'other';
          target_ref?: string | null;
          target_note?: string | null;
          substitute_practice_id?: string | null;
          substitute_count?: number | null;
          reason?: string;
          basis?: string | null;
          created_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      question_references: {
        Row: {
          id: string;
          question_id: string;
          reference_text: string;
          published_at: string | null;
          published_by: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          question_id?: string;
          reference_text?: string;
          published_at?: string | null;
          published_by?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          question_id?: string;
          reference_text?: string;
          published_at?: string | null;
          published_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      question_responses: {
        Row: {
          id: string;
          question_id: string;
          user_id: string;
          cohort_id: string | null;
          answer_text: string | null;
          answer_payload: Json | null;
          is_correct: boolean | null;
          submitted_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          question_id?: string;
          user_id?: string;
          cohort_id?: string | null;
          answer_text?: string | null;
          answer_payload?: Json | null;
          is_correct?: boolean | null;
          submitted_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          question_id?: string;
          user_id?: string;
          cohort_id?: string | null;
          answer_text?: string | null;
          answer_payload?: Json | null;
          is_correct?: boolean | null;
          submitted_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          lesson_id: string;
          question_number: number;
          prompt: string;
          source_hint: string | null;
          question_type: 'open' | 'single' | 'judge' | 'fill' | 'flip' | 'verse' | 'chain';
          payload: Json | null;
          display_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          lesson_id?: string;
          question_number?: number;
          prompt?: string;
          source_hint?: string | null;
          question_type?: 'open' | 'single' | 'judge' | 'fill' | 'flip' | 'verse' | 'chain';
          payload?: Json | null;
          display_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          question_number?: number;
          prompt?: string;
          source_hint?: string | null;
          question_type?: 'open' | 'single' | 'judge' | 'fill' | 'flip' | 'verse' | 'chain';
          payload?: Json | null;
          display_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      reminder_presets: {
        Row: {
          id: string;
          label: string;
          category: string | null;
          display_order: number | null;
          is_active: boolean | null;
          created_by: string | null;
          created_at: string | null;
          updated_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          label?: string;
          category?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          label?: string;
          category?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      search_chunks: {
        Row: {
          block_id: string;
          source_kind: string;
          content_hash: string;
          embedding: unknown;
          text: string;
          block_type: string | null;
          text_layer: string | null;
          url: string;
          breadcrumb: string;
          title: string | null;
          course_slug: string | null;
          course_name: string | null;
          author: string | null;
          lesson_number: number | null;
          lesson_title: string | null;
          kepan_path: Json | null;
          book_number: number | null;
          article_number: number | null;
          program_slugs: (string)[];
          programs: (string)[];
          speakers: (string)[];
          updated_at: string;
        };
        Insert: {
          block_id?: string;
          source_kind?: string;
          content_hash?: string;
          embedding?: unknown;
          text?: string;
          block_type?: string | null;
          text_layer?: string | null;
          url?: string;
          breadcrumb?: string;
          title?: string | null;
          course_slug?: string | null;
          course_name?: string | null;
          author?: string | null;
          lesson_number?: number | null;
          lesson_title?: string | null;
          kepan_path?: Json | null;
          book_number?: number | null;
          article_number?: number | null;
          program_slugs?: (string)[];
          programs?: (string)[];
          speakers?: (string)[];
          updated_at?: string;
        };
        Update: {
          block_id?: string;
          source_kind?: string;
          content_hash?: string;
          embedding?: unknown;
          text?: string;
          block_type?: string | null;
          text_layer?: string | null;
          url?: string;
          breadcrumb?: string;
          title?: string | null;
          course_slug?: string | null;
          course_name?: string | null;
          author?: string | null;
          lesson_number?: number | null;
          lesson_title?: string | null;
          kepan_path?: Json | null;
          book_number?: number | null;
          article_number?: number | null;
          program_slugs?: (string)[];
          programs?: (string)[];
          speakers?: (string)[];
          updated_at?: string;
        };
        Relationships: [];
      };
      search_log: {
        Row: {
          id: number;
          created_at: string;
          q_norm: string;
          result_count: number;
          had_results: boolean | null;
          source: string | null;
          program: string | null;
          courses: (string)[] | null;
          speaker: string | null;
          top_distance: number | null;
        };
        Insert: {
          id?: number;
          created_at?: string;
          q_norm?: string;
          result_count?: number;
          had_results?: boolean | null;
          source?: string | null;
          program?: string | null;
          courses?: (string)[] | null;
          speaker?: string | null;
          top_distance?: number | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          q_norm?: string;
          result_count?: number;
          had_results?: boolean | null;
          source?: string | null;
          program?: string | null;
          courses?: (string)[] | null;
          speaker?: string | null;
          top_distance?: number | null;
        };
        Relationships: [];
      };
      self_study_article_categories: {
        Row: {
          article_id: string;
          category_id: string;
        };
        Insert: {
          article_id?: string;
          category_id?: string;
        };
        Update: {
          article_id?: string;
          category_id?: string;
        };
        Relationships: [];
      };
      self_study_articles: {
        Row: {
          id: string;
          book_id: string;
          article_number: number;
          title: string;
          display_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          book_id?: string;
          article_number?: number;
          title?: string;
          display_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          book_id?: string;
          article_number?: number;
          title?: string;
          display_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      self_study_blocks: {
        Row: {
          id: string;
          article_id: string;
          block_order: number;
          block_type: 'title' | 'inline_heading' | 'body' | 'verse' | 'footnote';
          text: string | null;
          heading_mark: string | null;
          heading_level: number | null;
          footnote_ref: number | null;
          text_layer: 'teaching' | 'commentary' | 'variant' | null;
          quotes: Json | null;
          author: string | null;
          confidence: 'high' | 'low' | null;
          source_doc: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          article_id?: string;
          block_order?: number;
          block_type?: 'title' | 'inline_heading' | 'body' | 'verse' | 'footnote';
          text?: string | null;
          heading_mark?: string | null;
          heading_level?: number | null;
          footnote_ref?: number | null;
          text_layer?: 'teaching' | 'commentary' | 'variant' | null;
          quotes?: Json | null;
          author?: string | null;
          confidence?: 'high' | 'low' | null;
          source_doc?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          article_id?: string;
          block_order?: number;
          block_type?: 'title' | 'inline_heading' | 'body' | 'verse' | 'footnote';
          text?: string | null;
          heading_mark?: string | null;
          heading_level?: number | null;
          footnote_ref?: number | null;
          text_layer?: 'teaching' | 'commentary' | 'variant' | null;
          quotes?: Json | null;
          author?: string | null;
          confidence?: 'high' | 'low' | null;
          source_doc?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      self_study_books: {
        Row: {
          id: string;
          book_number: number | null;
          title: string;
          author: string | null;
          description: string | null;
          display_order: number | null;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          book_number?: number | null;
          title?: string;
          author?: string | null;
          description?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          book_number?: number | null;
          title?: string;
          author?: string | null;
          description?: string | null;
          display_order?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      self_study_categories: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          display_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name?: string;
          slug?: string | null;
          display_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          display_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      self_study_grants: {
        Row: {
          id: string;
          user_id: string;
          granted_by: string | null;
          granted_at: string | null;
          reason: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          granted_by?: string | null;
          granted_at?: string | null;
          reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          granted_by?: string | null;
          granted_at?: string | null;
          reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
        };
        Relationships: [];
      };
      self_study_records: {
        Row: {
          id: string;
          user_id: string;
          cohort_id: string;
          book_id: string;
          article_id: string;
          status: 'not_started' | 'reading' | 'completed' | 'paused' | null;
          started_at: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          watched_at: string | null;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          cohort_id?: string;
          book_id?: string;
          article_id?: string;
          status?: 'not_started' | 'reading' | 'completed' | 'paused' | null;
          started_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          watched_at?: string | null;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          cohort_id?: string;
          book_id?: string;
          article_id?: string;
          status?: 'not_started' | 'reading' | 'completed' | 'paused' | null;
          started_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          watched_at?: string | null;
          read_at?: string | null;
        };
        Relationships: [];
      };
      self_study_resources: {
        Row: {
          id: string;
          article_id: string;
          kind: string;
          url: string;
          label: string | null;
          sort_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          article_id?: string;
          kind?: string;
          url?: string;
          label?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          article_id?: string;
          kind?: string;
          url?: string;
          label?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      sm2_cards: {
        Row: {
          id: string;
          user_id: string;
          question_id: string;
          ease_factor: number;
          interval_days: number;
          repetitions: number;
          due_date: string;
          sm2_status: string;
          last_reviewed_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          question_id?: string;
          ease_factor?: number;
          interval_days?: number;
          repetitions?: number;
          due_date?: string;
          sm2_status?: string;
          last_reviewed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          question_id?: string;
          ease_factor?: number;
          interval_days?: number;
          repetitions?: number;
          due_date?: string;
          sm2_status?: string;
          last_reviewed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      sms_log: {
        Row: {
          id: string;
          user_id: string | null;
          phone: string;
          template: string | null;
          sent_at: string | null;
          status: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          phone?: string;
          template?: string | null;
          sent_at?: string | null;
          status?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          phone?: string;
          template?: string | null;
          sent_at?: string | null;
          status?: string | null;
        };
        Relationships: [];
      };
      speaking_evaluations: {
        Row: {
          id: string;
          study_record_id: string;
          grade: 'pass' | 'needs_improvement';
          notes: string | null;
          created_by: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          study_record_id?: string;
          grade?: 'pass' | 'needs_improvement';
          notes?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          study_record_id?: string;
          grade?: 'pass' | 'needs_improvement';
          notes?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      speaking_sessions: {
        Row: {
          id: string;
          cohort_id: string;
          lesson_id: string;
          session_end_at: string;
          notes: string | null;
          created_by: string | null;
          created_at: string | null;
          group_session_id: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          cohort_id?: string;
          lesson_id?: string;
          session_end_at?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          group_session_id?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          lesson_id?: string;
          session_end_at?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string | null;
          group_session_id?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      study_records: {
        Row: {
          id: string;
          user_id: string;
          cohort_id: string;
          lesson_id: string;
          study_type: 'listen' | 'read_notes' | 'speaking_present' | 'speaking_question' | 'speaking_observe' | 'group_attend' | 'group_absent' | 'group_review' | 'group_summary';
          lesson_resource_id: string | null;
          group_session_id: string | null;
          speaking_session_id: string | null;
          created_by: string | null;
          study_date: string;
          notes: string | null;
          created_at: string | null;
          is_confirmed: boolean | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          cohort_id?: string;
          lesson_id?: string;
          study_type?: 'listen' | 'read_notes' | 'speaking_present' | 'speaking_question' | 'speaking_observe' | 'group_attend' | 'group_absent' | 'group_review' | 'group_summary';
          lesson_resource_id?: string | null;
          group_session_id?: string | null;
          speaking_session_id?: string | null;
          created_by?: string | null;
          study_date?: string;
          notes?: string | null;
          created_at?: string | null;
          is_confirmed?: boolean | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          cohort_id?: string;
          lesson_id?: string;
          study_type?: 'listen' | 'read_notes' | 'speaking_present' | 'speaking_question' | 'speaking_observe' | 'group_attend' | 'group_absent' | 'group_review' | 'group_summary';
          lesson_resource_id?: string | null;
          group_session_id?: string | null;
          speaking_session_id?: string | null;
          created_by?: string | null;
          study_date?: string;
          notes?: string | null;
          created_at?: string | null;
          is_confirmed?: boolean | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      system_admins: {
        Row: {
          user_id: string;
          granted_at: string | null;
          granted_by: string | null;
        };
        Insert: {
          user_id?: string;
          granted_at?: string | null;
          granted_by?: string | null;
        };
        Update: {
          user_id?: string;
          granted_at?: string | null;
          granted_by?: string | null;
        };
        Relationships: [];
      };
      texts: {
        Row: {
          id: string;
          slug: string;
          name: string;
          author: string | null;
          aliases: (string)[];
          description: string | null;
          root_course_id: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug?: string;
          name?: string;
          author?: string | null;
          aliases?: (string)[];
          description?: string | null;
          root_course_id?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          author?: string | null;
          aliases?: (string)[];
          description?: string | null;
          root_course_id?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      tibetan_calendar: {
        Row: {
          gregorian_date: string;
          tib_year: number;
          tib_month: number;
          tib_day: number;
          tib_month_name: string;
          tib_day_name: string;
          is_leap_day: boolean;
          nong_month_name: string | null;
          nong_day_name: string | null;
          nong_month: number | null;
          nong_day: number | null;
          created_at: string | null;
        };
        Insert: {
          gregorian_date?: string;
          tib_year?: number;
          tib_month?: number;
          tib_day?: number;
          tib_month_name?: string;
          tib_day_name?: string;
          is_leap_day?: boolean;
          nong_month_name?: string | null;
          nong_day_name?: string | null;
          nong_month?: number | null;
          nong_day?: number | null;
          created_at?: string | null;
        };
        Update: {
          gregorian_date?: string;
          tib_year?: number;
          tib_month?: number;
          tib_day?: number;
          tib_month_name?: string;
          tib_day_name?: string;
          is_leap_day?: boolean;
          nong_month_name?: string | null;
          nong_day_name?: string | null;
          nong_month?: number | null;
          nong_day?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      tibetan_days: {
        Row: {
          id: string;
          gregorian_date: string;
          tibetan_year: number | null;
          tibetan_month: number | null;
          tibetan_day: number | null;
          tibetan_month_name: string | null;
          is_leap_month: boolean | null;
          lunar_date: string | null;
          tags: (string)[] | null;
          is_auspicious: boolean | null;
          events: Json | null;
          public_holiday: string | null;
          notes: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          gregorian_date?: string;
          tibetan_year?: number | null;
          tibetan_month?: number | null;
          tibetan_day?: number | null;
          tibetan_month_name?: string | null;
          is_leap_month?: boolean | null;
          lunar_date?: string | null;
          tags?: (string)[] | null;
          is_auspicious?: boolean | null;
          events?: Json | null;
          public_holiday?: string | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          gregorian_date?: string;
          tibetan_year?: number | null;
          tibetan_month?: number | null;
          tibetan_day?: number | null;
          tibetan_month_name?: string | null;
          is_leap_month?: boolean | null;
          lunar_date?: string | null;
          tags?: (string)[] | null;
          is_auspicious?: boolean | null;
          events?: Json | null;
          public_holiday?: string | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      transmissions: {
        Row: {
          id: string;
          name: string;
          source_kind: 'course' | 'assembly';
          related_course_id: string | null;
          description: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name?: string;
          source_kind?: 'course' | 'assembly';
          related_course_id?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          source_kind?: 'course' | 'assembly';
          related_course_id?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      user_lesson_progress: {
        Row: {
          user_id: string;
          lesson_id: string;
          last_position: number | null;
          last_media: string | null;
          last_read_at: string | null;
        };
        Insert: {
          user_id?: string;
          lesson_id?: string;
          last_position?: number | null;
          last_media?: string | null;
          last_read_at?: string | null;
        };
        Update: {
          user_id?: string;
          lesson_id?: string;
          last_position?: number | null;
          last_media?: string | null;
          last_read_at?: string | null;
        };
        Relationships: [];
      };
      user_practice_vows: {
        Row: {
          id: string;
          user_id: string;
          source: 'auto' | 'custom';
          template_id: string | null;
          cohort_id: string | null;
          event_id: string | null;
          appointment_id: string | null;
          share_to_collective: boolean | null;
          practice_id: string;
          custom_name: string | null;
          target_count: number | null;
          target_period: 'lifetime' | 'until_complete' | 'daily' | 'weekly';
          daily_target: number | null;
          weekly_target: number | null;
          min_session_minutes: number | null;
          pace_history: Json | null;
          start_date: string;
          is_early_start: boolean | null;
          early_start_reason: string | null;
          original_end_date: string | null;
          current_end_date: string | null;
          current_count: number | null;
          current_session_count: number | null;
          current_status: 'on_track' | 'slightly_behind' | 'falling_behind' | 'at_risk' | 'will_overdue' | 'completed' | 'paused' | null;
          status_calculated_at: string | null;
          status_details: Json | null;
          is_required_for_promotion: boolean | null;
          is_public: boolean | null;
          status: 'active' | 'paused' | 'completed' | 'abandoned' | null;
          paused_at: string | null;
          paused_by: string | null;
          paused_reason: string | null;
          resumed_at: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          client_token: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          source?: 'auto' | 'custom';
          template_id?: string | null;
          cohort_id?: string | null;
          event_id?: string | null;
          appointment_id?: string | null;
          share_to_collective?: boolean | null;
          practice_id?: string;
          custom_name?: string | null;
          target_count?: number | null;
          target_period?: 'lifetime' | 'until_complete' | 'daily' | 'weekly';
          daily_target?: number | null;
          weekly_target?: number | null;
          min_session_minutes?: number | null;
          pace_history?: Json | null;
          start_date?: string;
          is_early_start?: boolean | null;
          early_start_reason?: string | null;
          original_end_date?: string | null;
          current_end_date?: string | null;
          current_count?: number | null;
          current_session_count?: number | null;
          current_status?: 'on_track' | 'slightly_behind' | 'falling_behind' | 'at_risk' | 'will_overdue' | 'completed' | 'paused' | null;
          status_calculated_at?: string | null;
          status_details?: Json | null;
          is_required_for_promotion?: boolean | null;
          is_public?: boolean | null;
          status?: 'active' | 'paused' | 'completed' | 'abandoned' | null;
          paused_at?: string | null;
          paused_by?: string | null;
          paused_reason?: string | null;
          resumed_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          client_token?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: 'auto' | 'custom';
          template_id?: string | null;
          cohort_id?: string | null;
          event_id?: string | null;
          appointment_id?: string | null;
          share_to_collective?: boolean | null;
          practice_id?: string;
          custom_name?: string | null;
          target_count?: number | null;
          target_period?: 'lifetime' | 'until_complete' | 'daily' | 'weekly';
          daily_target?: number | null;
          weekly_target?: number | null;
          min_session_minutes?: number | null;
          pace_history?: Json | null;
          start_date?: string;
          is_early_start?: boolean | null;
          early_start_reason?: string | null;
          original_end_date?: string | null;
          current_end_date?: string | null;
          current_count?: number | null;
          current_session_count?: number | null;
          current_status?: 'on_track' | 'slightly_behind' | 'falling_behind' | 'at_risk' | 'will_overdue' | 'completed' | 'paused' | null;
          status_calculated_at?: string | null;
          status_details?: Json | null;
          is_required_for_promotion?: boolean | null;
          is_public?: boolean | null;
          status?: 'active' | 'paused' | 'completed' | 'abandoned' | null;
          paused_at?: string | null;
          paused_by?: string | null;
          paused_reason?: string | null;
          resumed_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          client_token?: string | null;
        };
        Relationships: [];
      };
      user_push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          device_info: string | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          expo_push_token?: string;
          device_info?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          expo_push_token?: string;
          device_info?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_reminders: {
        Row: {
          id: string;
          user_id: string;
          remind_time: string;
          label: string;
          preset_id: string | null;
          is_enabled: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          remind_time?: string;
          label?: string;
          preset_id?: string | null;
          is_enabled?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          remind_time?: string;
          label?: string;
          preset_id?: string | null;
          is_enabled?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_self_study_programs: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          start_date: string;
          status: 'active' | 'paused' | 'completed' | 'abandoned' | null;
          pace_level: 'slow' | 'normal' | 'intensive' | null;
          paused_at: string | null;
          paused_reason: string | null;
          resumed_at: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          is_primary: boolean | null;
          weekly_target: number | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          program_id?: string;
          start_date?: string;
          status?: 'active' | 'paused' | 'completed' | 'abandoned' | null;
          pace_level?: 'slow' | 'normal' | 'intensive' | null;
          paused_at?: string | null;
          paused_reason?: string | null;
          resumed_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          is_primary?: boolean | null;
          weekly_target?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_id?: string;
          start_date?: string;
          status?: 'active' | 'paused' | 'completed' | 'abandoned' | null;
          pace_level?: 'slow' | 'normal' | 'intensive' | null;
          paused_at?: string | null;
          paused_reason?: string | null;
          resumed_at?: string | null;
          completed_at?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          is_primary?: boolean | null;
          weekly_target?: number | null;
        };
        Relationships: [];
      };
      user_self_study_rest_weeks: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          rest_start_date: string;
          reason: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          program_id?: string;
          rest_start_date?: string;
          reason?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_id?: string;
          rest_start_date?: string;
          reason?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      user_transmissions: {
        Row: {
          id: string;
          user_id: string;
          transmission_id: string;
          source: 'course_listen' | 'restricted_check' | 'assembly' | 'proxy_recognize';
          obtained_at: string | null;
          recorded_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          transmission_id?: string;
          source?: 'course_listen' | 'restricted_check' | 'assembly' | 'proxy_recognize';
          obtained_at?: string | null;
          recorded_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          transmission_id?: string;
          source?: 'course_listen' | 'restricted_check' | 'assembly' | 'proxy_recognize';
          obtained_at?: string | null;
          recorded_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      weekly_study_summary: {
        Row: {
          id: string;
          user_id: string;
          cohort_id: string;
          week_id: string;
          required_count: number | null;
          completed_count: number | null;
          is_complete: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          cohort_id?: string;
          week_id?: string;
          required_count?: number | null;
          completed_count?: number | null;
          is_complete?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          cohort_id?: string;
          week_id?: string;
          required_count?: number | null;
          completed_count?: number | null;
          is_complete?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      v_advancement_5dim: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_advancement_transmissions: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_course_completion: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_daily_practice_completion: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_dharma_assembly_dates: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_event_dedication_totals: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_lesson_completion: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_program_practice_completion: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_program_practice_summary: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_browse: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_browse_items: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_canon_blocks: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_canon_divisions: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_canon_juan: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_canon_works: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_categories: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_public_course: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_user_study_all: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_weekly_dedication_totals: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
      v_weekly_session_count: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };
    };
    Functions: {
      admin_finalize_created_profile: {
        Args: {
          p_user_id: string | null;
          p_full_name: string | null;
          p_dharma_name: string | null;
          p_phone: string | null;
        };
        Returns: Json;
      };
      attendance_dim_lag: {
        Args: {
          p_user: string | null;
          p_cohort: string | null;
        };
        Returns: string;
      };
      cancel_account_deletion: {
        Args: {
          p_user_id: string | null;
        };
        Returns: Json;
      };
      get_care_dims: {
        Args: {
          p_user: string | null;
          p_cohort: string | null;
          p_today?: string | null;
        };
        Returns: Json;
      };
      get_cohort_care_dims: {
        Args: {
          p_cohort: string | null;
          p_today?: string | null;
        };
        Returns: Json;
      };
      get_cohort_lesson_completion: {
        Args: {
          p_cohort_id: string | null;
          p_lesson_ids: (string)[] | null;
        };
        Returns: Json;
      };
      get_cohort_today_active: {
        Args: {
          p_cohort_id: string | null;
        };
        Returns: Json;
      };
      get_cohort_week_totals: {
        Args: {
          p_cohort_id: string | null;
        };
        Returns: Json;
      };
      get_current_week_lessons: {
        Args: {
          p_user_id: string | null;
          p_program_id: string | null;
          p_today?: string | null;
        };
        Returns: Json;
      };
      get_current_week_number: {
        Args: {
          p_user_id: string | null;
          p_program_id: string | null;
          p_today?: string | null;
        };
        Returns: Json;
      };
      get_vow_status: {
        Args: {
          p_vow_id: string | null;
          p_today?: string | null;
        };
        Returns: string;
      };
      get_week_lessons: {
        Args: {
          p_program_id: string | null;
          p_semester_number: number | null;
          p_week_in_semester: number | null;
        };
        Returns: Json;
      };
      has_class_role: {
        Args: {
          p_cohort_id: string | null;
          p_roles: (string)[] | null;
        };
        Returns: boolean;
      };
      has_self_study_grant: {
        Args: {
          [key: string]: never;
        };
        Returns: boolean;
      };
      is_class_admin: {
        Args: {
          p_cohort_id: string | null;
        };
        Returns: boolean;
      };
      is_class_member: {
        Args: {
          p_cohort_id: string | null;
        };
        Returns: boolean;
      };
      is_formal_student: {
        Args: {
          [key: string]: never;
        };
        Returns: boolean;
      };
      is_system_admin: {
        Args: {
          [key: string]: never;
        };
        Returns: boolean;
      };
      log_search: {
        Args: {
          p_q: string | null;
          p_n: number | null;
          p_source?: string | null;
          p_program?: string | null;
          p_courses?: (string)[] | null;
          p_speaker?: string | null;
          p_top_distance?: number | null;
        };
        Returns: Json;
      };
      my_admin_cohorts: {
        Args: {
          p_roles?: (string)[] | null;
        };
        Returns: Json;
      };
      my_member_cohorts: {
        Args: {
          [key: string]: never;
        };
        Returns: Json;
      };
      practice_dim_lag: {
        Args: {
          p_user: string | null;
          p_cohort: string | null;
          p_today: string | null;
          p_meditation: boolean | null;
        };
        Returns: string;
      };
      promote_member_role: {
        Args: {
          p_cohort_id: string | null;
          p_user_id: string | null;
        };
        Returns: Json;
      };
      provision_cohort_vows: {
        Args: {
          p_cohort_id: string | null;
        };
        Returns: number;
      };
      provision_member_vows: {
        Args: {
          p_user_id: string | null;
          p_cohort_id: string | null;
        };
        Returns: number;
      };
      provision_selfstudy_vows: {
        Args: {
          p_user_id: string | null;
          p_program_id: string | null;
          p_today?: string | null;
        };
        Returns: number;
      };
      record_self_study_complete: {
        Args: {
          p_book_id: string | null;
          p_article_id: string | null;
          p_date: string | null;
        };
        Returns: Json;
      };
      record_self_study_mark: {
        Args: {
          p_book_id: string | null;
          p_article_id: string | null;
          p_date: string | null;
          p_kind?: string | null;
          p_completed?: boolean | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      record_study: {
        Args: {
          p_lesson_id: string | null;
          p_study_type: string | null;
          p_study_date: string | null;
          p_lesson_resource_id?: string | null;
          p_notes?: string | null;
          p_url_cohort_id?: string | null;
          p_client_token?: string | null;
        };
        Returns: Json;
      };
      request_account_deletion: {
        Args: {
          [key: string]: never;
        };
        Returns: Json;
      };
      search_semantic: {
        Args: {
          p_query: Json | null;
          p_match_count?: number | null;
          p_program?: string | null;
          p_courses?: (string)[] | null;
          p_speaker?: string | null;
          p_kinds?: (string)[] | null;
        };
        Returns: Json;
      };
      set_primary_self_study_program: {
        Args: {
          p_user_id: string | null;
          p_new_primary_program_id: string | null;
        };
        Returns: Json;
      };
      switch_primary_cohort: {
        Args: {
          p_user_id: string | null;
          p_new_primary_cohort_id: string | null;
        };
        Returns: Json;
      };
      update_cosession_settings: {
        Args: {
          p_cohort_id: string | null;
          p_weekly_dow: number | null;
          p_weekly_time: string | null;
          p_zoom_url: string | null;
          p_practice_dow: number | null;
          p_practice_time: string | null;
          p_practice_zoom_url: string | null;
        };
        Returns: Json;
      };
      update_reminder_settings: {
        Args: {
          p_cohort_id: string | null;
          p_enabled: boolean | null;
          p_weekday?: number | null;
          p_time?: string | null;
          p_message?: string | null;
        };
        Returns: Json;
      };
      vow_status_to_lag: {
        Args: {
          p_status: string | null;
        };
        Returns: string;
      };
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
};

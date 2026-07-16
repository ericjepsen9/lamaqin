#!/usr/bin/env python3
"""
迁移漂移校验器 · 防「仓库迁移文件 ≠ 库实际状态」
-------------------------------------------------------
不连任何密钥:从 netlify.toml 读公开 URL + anon key,纯探"近期迁移的产物是否在库里"
(列/函数/表/bucket 存在性——这些缺失会直接报错,与 RLS 无关)。
用法:python3 scripts/check_schema_parity.py
退出码 0 = 全部在场;非 0 = 有缺(打印清单)。CI / 人工随时可跑。
"""
import json, re, ssl, sys, urllib.request, urllib.error, urllib.parse, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
toml = open(os.path.join(ROOT, "netlify.toml")).read()
URL = re.search(r'EXPO_PUBLIC_SUPABASE_URL\s*=\s*"([^"]+)"', toml).group(1).rstrip("/")
KEY = re.search(r'EXPO_PUBLIC_SUPABASE_ANON_KEY\s*=\s*"([^"]+)"', toml).group(1)
ctx = ssl.create_default_context()

def req(method, path, body=None):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + urllib.parse.quote(path, safe="/?&=,.():*"), data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30, context=ctx) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# 每条 = (描述, 迁移文件, 检查函数 → (ok, 详情))
def col_exists(table, col):
    st, b = req("GET", f"/rest/v1/{table}?select={col}&limit=1")
    return (st == 200, f"HTTP {st}" if st != 200 else "列在场")

def table_exists(table):
    st, b = req("GET", f"/rest/v1/{table}?select=*&limit=1")
    return (st == 200, f"HTTP {st}")

def fn_exists(fn, sample):
    # 函数缺失 → PostgREST 404 / PGRST202;在场 → 其它(200 / 权限 / 业务报错均算"在场")
    st, b = req("POST", f"/rest/v1/rpc/{fn}", sample)
    missing = (st == 404) or ("PGRST202" in b) or ("Could not find the function" in b)
    return (not missing, f"HTTP {st}" + ("(在场)" if not missing else "(缺失)"))

CHECKS = [
    ("practice_templates 表", "20260618000060_practice", lambda: table_exists("practice_templates")),
    ("cohort_recommended_templates 表", "20260618000060_practice", lambda: table_exists("cohort_recommended_templates")),
    ("practice_templates.is_time_limited 列", "20260628000020_provision_cohort_vows", lambda: col_exists("practice_templates", "is_time_limited")),
    ("provision_cohort_vows() 函数", "20260628000020_provision_cohort_vows", lambda: fn_exists("provision_cohort_vows", {"p_cohort_id": "00000000-0000-0000-0000-000000000000"})),
    ("provision_member_vows() 函数", "20260628000020_provision_cohort_vows", lambda: fn_exists("provision_member_vows", {"p_user_id": "00000000-0000-0000-0000-000000000000", "p_cohort_id": "00000000-0000-0000-0000-000000000000"})),
    ("provision_selfstudy_vows() 函数", "20260628000020_provision_cohort_vows", lambda: fn_exists("provision_selfstudy_vows", {"p_user_id": "00000000-0000-0000-0000-000000000000", "p_program_id": "00000000-0000-0000-0000-000000000000"})),
    ("group_sessions.tracks_attendance 列", "20260621000010_group_sessions_tracks_attendance", lambda: col_exists("group_sessions", "tracks_attendance")),
    ("personal_study_records 表", "20260625000000_personal_study_records", lambda: table_exists("personal_study_records")),
    ("personal_self_study_records 表", "20260625000010_personal_self_study_records", lambda: table_exists("personal_self_study_records")),
    ("v_user_study_all 视图", "20260626000010_v_user_study_all", lambda: table_exists("v_user_study_all")),
    ("event_sessions 表", "20260630000010_event_sessions", lambda: table_exists("event_sessions")),
    ("courses.cover_accent_color 列", "20260701000020_courses_cover_accent_color", lambda: col_exists("courses", "cover_accent_color")),
    ("profiles.intended_program_id 列", "20260702000010_profiles_intended_program", lambda: col_exists("profiles", "intended_program_id")),
    ("self_study_records.watched_at 列", "20260702000020_speech_watch_read", lambda: col_exists("self_study_records", "watched_at")),
    ("personal_self_study_records.read_at 列", "20260702000020_speech_watch_read", lambda: col_exists("personal_self_study_records", "read_at")),
    ("record_self_study_mark() 函数", "20260702000020_speech_watch_read", lambda: fn_exists("record_self_study_mark", {"p_book_id": "00000000-0000-0000-0000-000000000000", "p_article_id": "00000000-0000-0000-0000-000000000000", "p_date": "2026-01-01"})),
    # 外部所有表(官网/ETL 线建,结构真源不在本仓;见 scripts/README.md「外部所有表清单」)。
    # App 在消费 → 缺了=又被清理脚本误删(2026-06-23 曾发生),必须报警。
    ("self_study_resources 表(外部·官网线)", "外部所有·勿DROP", lambda: table_exists("self_study_resources")),
    ("events.default_practice_id 列", "20260702000030_event_default_practice", lambda: col_exists("events", "default_practice_id")),
    ("events.default_target_count 列", "20260702000030_event_default_practice", lambda: col_exists("events", "default_target_count")),
    # ── 2026-07-04 ~ 07-09 批次(审计 2026-07-09 发现整批未应用到 dev——本清单当时没跟上,
    #    "防漂移"工具自身漂移了一周;此后每写新迁移必须同步在这里加检查项)──
    ("practice_logs.min_session_minutes_at_log 列", "20260704000000_counting_pd2_pd24_snapshot", lambda: col_exists("practice_logs", "min_session_minutes_at_log")),
    # 真实产物是视图,不是函数(2026-07-10 核实纠正,原探测名字猜错):
    ("v_daily_practice_completion 视图", "20260704000100_pureland_daily_completion", lambda: table_exists("v_daily_practice_completion")),
    ("v_weekly_session_count 视图", "20260704000200_weekly_session_count", lambda: table_exists("v_weekly_session_count")),
    ("practices.session_mode 列", "20260704000300_session_mode_per_log", lambda: col_exists("practices", "session_mode")),
    ("lesson_blocks.image_url 列(官网线已应用)", "20260706000000_lesson_block_image", lambda: col_exists("lesson_blocks", "image_url")),
    ("get_vow_status() 函数", "20260706000100_vow_status_fn", lambda: fn_exists("get_vow_status", {"p_vow_id": "00000000-0000-0000-0000-000000000000"})),
    # 参数名探测错了(真实签名是 p_user/p_cohort,不带 _id 后缀;2026-07-10 核实纠正):
    ("get_care_dims() 函数", "20260706000200_care_lag_fn", lambda: fn_exists("get_care_dims", {"p_user": "00000000-0000-0000-0000-000000000000", "p_cohort": "00000000-0000-0000-0000-000000000000"})),
    ("get_cohort_today_active() 函数", "20260707000000_cohort_today_active", lambda: fn_exists("get_cohort_today_active", {"p_cohort_id": "00000000-0000-0000-0000-000000000000"})),
    ("program_optional_practices 表", "20260707000100_optional_sutra_list", lambda: table_exists("program_optional_practices")),
    ("get_cohort_care_dims() 函数", "20260708000000_cohort_care_dims", lambda: fn_exists("get_cohort_care_dims", {"p_cohort": "00000000-0000-0000-0000-000000000000"})),
    ("practices.allowed_daily_targets 列", "20260708000300_daily_target_whitelist", lambda: col_exists("practices", "allowed_daily_targets")),
    ("practices.daily_target_locked 列", "20260708000300_daily_target_whitelist", lambda: col_exists("practices", "daily_target_locked")),
    ("home_posters.poster_type 列", "20260709000000_wave_a_schema", lambda: col_exists("home_posters", "poster_type")),
    ("practice_templates.default_min_session_minutes 列", "20260709000100_threshold_dual_layer", lambda: col_exists("practice_templates", "default_min_session_minutes")),
    ("speaking_evaluations 表", "20260709000200_speaking_grades", lambda: table_exists("speaking_evaluations")),
    ("speaking_sessions.group_session_id 列", "20260709000200_speaking_grades", lambda: col_exists("speaking_sessions", "group_session_id")),
    # (0708-100 整数座次CHECK / 0708-200 状态3档CHECK / 0708-400 过期锁触发器 / 0708-500 REVOKE /
    #  0709-400 cohorts_select 策略补 is_class_admin() 这五条产物 REST 用 anon key 探不到存在性
    #  (策略/约束改动,不是新列/新表/新函数;模拟 zhumai/aixin 真实身份才能验证),以同包相邻对象
    #  在场为应用凭据;严格验证走 SQL harness(0709-400 见 05_rls_full.sql 的 ⭐ 两条断言)。)
    # ── 补登记(2026-07-09):texts 实体这条迁移当年已直接应用到 sss-dev+生产(PR #10 自述),
    #    但 PR 被关闭未合并,仓库丢了这份档案 18 天——本次审计连带发现补registered回来;内容与
    #    已应用的完全一致(零改动),故本条检查从加入清单起就应该是绿的,不是"等应用"的一员。──
    ("texts 表(经/论实体,2026-06-23 已应用漏登记)", "20260623000000_texts_entity(补登记)", lambda: table_exists("texts")),
    ("courses.text_id 列", "20260623000000_texts_entity(补登记)", lambda: col_exists("courses", "text_id")),
    ("v_public_browse.text_id 列", "20260623000000_texts_entity(补登记)", lambda: col_exists("v_public_browse", "text_id")),
    ("profiles.deletion_requested_at 列", "20260710000000_account_deletion", lambda: col_exists("profiles", "deletion_requested_at")),
    ("request_account_deletion() 函数", "20260710000000_account_deletion", lambda: fn_exists("request_account_deletion", {})),
    ("cancel_account_deletion() 函数", "20260710000000_account_deletion", lambda: fn_exists("cancel_account_deletion", {"p_user_id": "00000000-0000-0000-0000-000000000000"})),
    # texts/dharma_assemblies 写策略收紧(20260710000100)是纯 RLS 改动,REST 探不到存在性,验证走 SQL harness。
    ("lesson_resources.slide_image_urls 列", "20260710000200_lesson_resources_slide_images", lambda: col_exists("lesson_resources", "slide_image_urls")),
    ("daily_rituals 表", "20260710000300_daily_rituals", lambda: table_exists("daily_rituals")),
    ("meditation_sessions 表", "20260710000400_meditation_sessions", lambda: table_exists("meditation_sessions")),
    ("notifications 表", "20260711000000_notifications", lambda: table_exists("notifications")),
    ("practice_logs.client_token 列", "20260712000000_practice_logs_idempotency", lambda: col_exists("practice_logs", "client_token")),
    ("exam_grades.exam_format 列", "20260712000100_exam_format", lambda: col_exists("exam_grades", "exam_format")),
    ("v_lesson_completion 视图", "20260712000200_completion_views", lambda: table_exists("v_lesson_completion")),
    ("v_course_completion 视图", "20260712000200_completion_views", lambda: table_exists("v_course_completion")),
    ("v_program_practice_completion 视图", "20260712000200_completion_views", lambda: table_exists("v_program_practice_completion")),
    ("v_program_practice_summary 视图", "20260712000200_completion_views", lambda: table_exists("v_program_practice_summary")),
    ("v_lesson_completion.touched 列", "20260712000300_lesson_completion_touched", lambda: col_exists("v_lesson_completion", "touched")),
    ("advancement_records.client_token 列", "20260712000400_admin_writes_idempotency", lambda: col_exists("advancement_records", "client_token")),
    ("exam_grades.client_token 列", "20260712000400_admin_writes_idempotency", lambda: col_exists("exam_grades", "client_token")),
    ("proxy_action_records.client_token 列", "20260712000400_admin_writes_idempotency", lambda: col_exists("proxy_action_records", "client_token")),
    ("get_cohort_lesson_completion() 函数", "20260712000500_cohort_lesson_completion", lambda: fn_exists("get_cohort_lesson_completion", {"p_cohort_id": "00000000-0000-0000-0000-000000000000", "p_lesson_ids": []})),
    ("profiles.welcome_seen_at 列", "20260712000600_welcome_back", lambda: col_exists("profiles", "welcome_seen_at")),
    # user_practice_vows_target_count_check(20260713000000)是纯 CHECK 约束,列本就存在,
    # col_exists 探不出约束是否真的加上了(false positive),验证走 SQL harness / 直接试插入0。
    # class_members_bump_held_back_trigger(20260713000100)、pause_vows_on_cohort_exit_trigger
    # +practice_logs_insert策略改写(20260713000200)同样是纯触发器/策略改动,不新增列/表/
    # 可调用函数,REST anon key探不到,验证走 SQL harness(04_functions.sql held_back_count三条断言)。
    # practice_templates/exam_grades的5+1条CHECK约束(20260713000300)同理,验证走
    # 03_constraints.sql A1数值校验补漏那6条断言。
    ("care_followups.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("care_followups", "client_token")),
    ("events.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("events", "client_token")),
    ("event_sessions.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("event_sessions", "client_token")),
    ("cohort_announcements.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("cohort_announcements", "client_token")),
    ("user_practice_vows.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("user_practice_vows", "client_token")),
    ("feedback.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("feedback", "client_token")),
    ("meditation_sessions.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("meditation_sessions", "client_token")),
    ("practice_templates.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("practice_templates", "client_token")),
    ("reminder_presets.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("reminder_presets", "client_token")),
    ("speaking_sessions.client_token 列", "20260713000400_a3_idempotency_batch", lambda: col_exists("speaking_sessions", "client_token")),
    ("study_records.client_token 列", "20260713000500_record_study_idempotency", lambda: col_exists("study_records", "client_token")),
    ("personal_study_records.client_token 列", "20260713000500_record_study_idempotency", lambda: col_exists("personal_study_records", "client_token")),
    ("record_study() p_client_token 参数", "20260713000500_record_study_idempotency", lambda: fn_exists("record_study", {"p_lesson_id": "00000000-0000-0000-0000-000000000000", "p_study_type": "listen", "p_study_date": "2026-01-01", "p_client_token": "x"})),
    # attendance_dim_lag(20260714000000)是改函数体(签名不变),fn_exists 探不出"改没改"
    # (函数改前改后都"在场",false negative 反过来的那种坑),验证走 SQL harness SM-7b 断言。
    ("profiles.must_change_password 列", "20260715000000_must_change_password", lambda: col_exists("profiles", "must_change_password")),
    # admin_finalize_created_profile 只 GRANT 给 service_role(anon 应该拿 permission denied,
    # 不是"函数不存在"的404/PGRST202——fn_exists 把权限报错也算"在场",这条探的就是这个)。
    ("admin_finalize_created_profile() 函数", "20260715000100_admin_create_user", lambda: fn_exists("admin_finalize_created_profile", {"p_user_id": "00000000-0000-0000-0000-000000000000", "p_full_name": "x", "p_dharma_name": None, "p_phone": None})),
    # update_cosession_settings(20260715000300)是"先DROP旧签名(全带DEFAULT)再CREATE新签名
    # (全必填)",fn_exists 用 anon key 探测报"无权限"也算在场,探不出参数是否真的改成必填了——
    # 那部分验证走 SQL harness 05_rls_full.sql ①②③三条(权限+清空bug回归)。
    ("update_cosession_settings() 函数(新签名)", "20260715000300_cosession_settings_zhumai", lambda: fn_exists("update_cosession_settings", {"p_cohort_id": "00000000-0000-0000-0000-000000000000", "p_weekly_dow": None, "p_weekly_time": None, "p_zoom_url": None, "p_practice_dow": None, "p_practice_time": None, "p_practice_zoom_url": None})),
    ("programs.neijiaxing_lock_years 列", "20260715000400_self_study_neijiaxing_lock_years", lambda: col_exists("programs", "neijiaxing_lock_years")),
    # provision_selfstudy_vows 改成3参(p_today);2参签名已被新迁移DROP,fn_exists探不出"参数
    # 变没变"(只要函数名存在的某个重载就算在场),这条只确认新3参签名真的能被探到。
    ("provision_selfstudy_vows() 函数(新3参签名)", "20260716000000_provision_current_date_fallback", lambda: fn_exists("provision_selfstudy_vows", {"p_user_id": "00000000-0000-0000-0000-000000000000", "p_program_id": "00000000-0000-0000-0000-000000000000", "p_today": "2026-01-01"})),
]

print(f"库:{URL}\n")
bad = []
for desc, mig, fn in CHECKS:
    ok, detail = fn()
    print(f"  {'✓' if ok else '✗'} {desc:38} [{mig}] {detail}")
    if not ok:
        bad.append((desc, mig))

print()
if bad:
    print(f"✗ {len(bad)} 项缺失 —— 这些迁移可能未应用到本库:")
    for desc, mig in bad:
        print(f"    · {mig}  ({desc})")
    sys.exit(1)
print("✓ 近期迁移产物全部在场,仓库与本库一致(无漂移)。")

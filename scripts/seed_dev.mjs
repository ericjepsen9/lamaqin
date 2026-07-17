#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// sss-dev 种子数据 · 让后台/学员端能用「真实形态」数据验证(升学5维 / 关怀 / 功课 / 出勤)
// --------------------------------------------------------------------
// ⚠️ 仅 sss-dev!需 service_role 密钥(建 auth.users)。生产 sss 绝不跑。
// 用法:
//   SUPABASE_SERVICE_ROLE_KEY=<sss-dev 的 service_role>  node scripts/seed_dev.mjs          # 清旧种子 + 重新播种
//   SUPABASE_SERVICE_ROLE_KEY=<...>                       node scripts/seed_dev.mjs --clear  # 只清除种子
// 标记(便于一键清):学员邮箱 @SEED_DOMAIN;班级 code 前缀 SEED_;模板名前缀「种子·」。
// 清除顺序:先删种子 auth 用户(级联 profiles→class_members/愿/打卡/记录/system_admins/class_admins)→ 删 SEED_ 班(级联场次)→ 删种子模板。
// ── QA 角色号(供分角色测试)──────────────────────────────────────────
//   seed01..seed09 = 学员(加行5 / 净土4;formal+auditor 混)
//   seed10 = 系统管理员(system_admins) · seed11 = 辅导员 zhumai(绑 SEED_JX) · seed12 = 爱心 aixin(绑 SEED_JX)
//   密码:下面这行写的是本脚本(.mjs 路径)自己会用的值——但 sss-dev 上现存的这批种子号,
//   实际是 2026-06-29 经 Supabase MCP execute_sql 直接灌的(见
//   docs/施工记录_功课配置模块_2026-06-28.md 记录),用的是另一个密码 `SeedPass-2026`,
//   跟这行不是同一个(2026-07-10 审计发现,两条路径从建库起就没对齐,不是谁改了密码)。
//   要登录 sss-dev 现存种子号,用 `SeedPass-2026`;真跑本脚本重新建号才会是下面这个值。
//   域:@seed.bicwny.test
//   全部密码:seed-Test-00000000
// ════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('✗ 需要环境变量 EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const CLEAR_ONLY = process.argv.includes('--clear');
const SEED_DOMAIN = 'seed.bicwny.test';
const TPL_PREFIX = '种子·';

const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const isoAt = (dateStr, hh) => new Date(`${dateStr}T${hh}:00:00Z`).toISOString();
const die = (msg, e) => { console.error('✗', msg, e?.message ?? e ?? ''); process.exit(1); };

// ── 清除既有种子 ──────────────────────────────────────────────────────
async function clearSeed() {
  // 1) 种子 auth 用户(级联清掉其 profiles + 名单 + 愿 + 打卡 + 记录)
  const { data: list, error: lerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (lerr) die('listUsers 失败', lerr);
  const seedUsers = (list?.users ?? []).filter((u) => (u.email ?? '').endsWith('@' + SEED_DOMAIN));
  for (const u of seedUsers) {
    const { error } = await sb.auth.admin.deleteUser(u.id);
    if (error) console.warn('  ⚠ 删用户', u.email, error.message);
  }
  // 2) SEED_ 班级(级联 class_members / group_sessions / cohort_recommended_templates)
  await sb.from('cohorts').delete().like('code', 'SEED_%');
  // 3) 种子模板
  await sb.from('practice_templates').delete().like('template_name', TPL_PREFIX + '%');
  console.log(`  清除:种子用户 ${seedUsers.length} 个 + SEED_ 班 + 种子模板`);
}

// ── 工具:取专业 / 修法 / 某专业的若干课时 ────────────────────────────
async function getProgram(name) {
  const { data: p } = await sb.from('programs').select('id,name').eq('name', name).maybeSingle();
  return p;
}
async function getPractice(name) {
  const { data } = await sb.from('practices').select('id,name,unit').eq('name', name).maybeSingle();
  return data;
}
async function getLessons(programId, n) {
  const { data: pc } = await sb.from('program_courses').select('course_id').eq('program_id', programId);
  const courseIds = [...new Set((pc ?? []).map((r) => r.course_id))];
  if (courseIds.length === 0) return [];
  const { data: lessons } = await sb.from('course_lessons').select('id,title').in('course_id', courseIds).limit(n);
  return lessons ?? [];
}

// ── 建学员(auth 用户 + profile)──────────────────────────────────────
async function createStudent(idx, name) {
  const email = `seed${String(idx).padStart(2, '0')}@${SEED_DOMAIN}`;
  const { data, error } = await sb.auth.admin.createUser({
    email, password: 'seed-Test-00000000', email_confirm: true,
    user_metadata: { full_name: name, seed: true },
  });
  if (error) die('createUser ' + email, error);
  const uid = data.user.id;
  // profile 可能被 handle_new_user 触发器先建 → upsert
  const { error: perr } = await sb.from('profiles').upsert({
    id: uid, email, full_name: name, status: 'active', data_source: 'admin_created', learning_mode: 'class',
  }, { onConflict: 'id' });
  if (perr) die('upsert profile ' + email, perr);
  return uid;
}

// ── 建班 + 模板 + 愿 + 打卡 + 共修 + 出勤/闻思 ────────────────────────
async function seedCohort({ program, code, name, startDate, students, template, lessons }) {
  // 班级
  const { data: co, error: cerr } = await sb.from('cohorts').insert({
    program_id: program.id, name, code, start_date: startDate, timezone: 'Asia/Shanghai', is_active: true,
  }).select('id,start_date,neijiaxing_lock_years').single();
  if (cerr) die('建班 ' + code, cerr);

  // 模板(专业默认;挂 applies_to_programs)
  const { data: tpl, error: terr } = await sb.from('practice_templates').insert({
    practice_id: template.practiceId, template_name: TPL_PREFIX + template.name,
    target_count: template.target, target_period: template.period,
    default_daily_target: template.daily, starts_offset_days: 0,
    is_time_limited: template.limited, applies_to_programs: [program.id], is_active: true,
  }).select('id').single();
  if (terr) die('建模板 ' + template.name, terr);

  const lock = co.neijiaxing_lock_years ?? 4;
  for (let i = 0; i < students.length; i++) {
    const uid = students[i];
    // 名单
    await sb.from('class_members').insert({
      cohort_id: co.id, user_id: uid, status: 'active',
      member_role: i === 0 ? 'formal' : (i % 2 ? 'auditor' : 'formal'),
      joined_at: isoAt(startDate, '09'), is_primary: true,
    });
    // 愿(等价 provision:限时→梯次+年限;非限时 lifetime→无终点)
    const start = startDate;
    const end = template.period === 'lifetime' ? null
      : (template.limited ? daysAgoPlus(startDate, lock * 365) : daysAgoPlus(startDate, 365));
    const { data: vow } = await sb.from('user_practice_vows').insert({
      user_id: uid, source: 'auto', template_id: tpl.id, cohort_id: co.id, practice_id: template.practiceId,
      target_count: template.target, target_period: template.period, daily_target: template.daily,
      start_date: start, original_end_date: end, current_end_date: end,
      is_required_for_promotion: true, share_to_collective: true, status: 'active',
    }).select('id').single();
    // 打卡(梯度:有人接近目标、有人落后 → 给关怀/修量维造差异)
    if (vow) {
      const sessions = [0, 1, 2][i % 3] + 1; // 1~3 笔
      const per = template.daily ?? 108;
      for (let s = 0; s < sessions; s++) {
        await sb.from('practice_logs').insert({
          user_id: uid, vow_id: vow.id, count: per, log_date: daysAgo(7 * (s + 1)), is_confirmed: true,
        });
      }
    }
  }

  // 共修场次 + 出勤/闻思(需课时)
  if (lessons.length > 0) {
    const sess = [];
    for (let k = 0; k < Math.min(3, lessons.length); k++) {
      const d = daysAgo(7 * (k + 1));
      const { data: gs } = await sb.from('group_sessions').insert({
        cohort_id: co.id, lesson_id: lessons[k].id,
        scheduled_at: isoAt(d, '19'), session_end_at: isoAt(d, '21'), cosession_type: 'regular',
      }).select('id,lesson_id,scheduled_at').single();
      if (gs) sess.push(gs);
    }
    for (let i = 0; i < students.length; i++) {
      const uid = students[i];
      for (const gs of sess) {
        const present = !((i + sess.indexOf(gs)) % 4 === 0); // ~3/4 出勤
        await sb.from('study_records').insert({
          user_id: uid, cohort_id: co.id, lesson_id: gs.lesson_id,
          study_type: present ? 'group_attend' : 'group_absent',
          group_session_id: gs.id, study_date: gs.scheduled_at.slice(0, 10),
        });
        // 听课(传承维)——出勤者顺带记一条 listen
        if (present) {
          await sb.from('study_records').insert({
            user_id: uid, cohort_id: co.id, lesson_id: gs.lesson_id,
            study_type: 'listen', study_date: gs.scheduled_at.slice(0, 10),
          });
        }
      }
    }
  }
  console.log(`  ✓ ${name}: ${students.length} 学员 + 模板「${template.name}」+ 愿/打卡/共修/出勤`);
  return co.id;
}

function daysAgoPlus(dateStr, addDays) {
  const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + addDays); return d.toISOString().slice(0, 10);
}

const NAMES = ['测试·慧明','测试·净莲','测试·圆照','测试·常乐','测试·妙音','测试·智海','测试·法喜','测试·觉悟','测试·善缘'];

async function main() {
  console.log('库:', URL);
  console.log('— 清除既有种子 —');
  await clearSeed();
  if (CLEAR_ONLY) { console.log('✓ 仅清除,完成。'); return; }

  console.log('— 播种 —');
  const jx = await getProgram('加行');
  const jt = await getProgram('净土');
  if (!jx || !jt) die('找不到 加行/净土 专业');
  const baiziming = await getPractice('百字明');
  const mituo = await getPractice('阿弥陀佛号');
  if (!baiziming || !mituo) die('找不到 百字明/阿弥陀佛号 修法');

  const jxLessons = await getLessons(jx.id, 4);
  const jtLessons = await getLessons(jt.id, 4);

  // 9 名学员:5 加行 + 4 净土
  const students = [];
  for (let i = 1; i <= 9; i++) students.push(await createStudent(i, NAMES[i - 1]));

  const jxCohortId = await seedCohort({
    program: jx, code: 'SEED_JX', name: '测试·种子加行班', startDate: daysAgo(200),
    students: students.slice(0, 5),
    template: { practiceId: baiziming.id, name: '百字明10万', target: 100000, period: 'until_complete', daily: 300, limited: true },
    lessons: jxLessons,
  });
  await seedCohort({
    program: jt, code: 'SEED_JT', name: '测试·种子净土班', startDate: daysAgo(100),
    students: students.slice(5, 9),
    template: { practiceId: mituo.id, name: '阿弥陀佛号·每日', target: null, period: 'lifetime', daily: 1000, limited: false },
    lessons: jtLessons,
  });

  // ── 角色测试号(QA 分角色测:系统管理员 / 辅导员 / 爱心)────────────────
  // 复用 createStudent 建 auth 用户 + profile;不入 class_members(他们是管理者,非学员)。
  // 辅导员/爱心绑到加行班 SEED_JX,以便测「本班可写、别班(净土 SEED_JT)被拦」。
  const adminUid = await createStudent(10, '测试·系统管理员');
  const zhumaiUid = await createStudent(11, '测试·辅导员(加行)');
  const aixinUid = await createStudent(12, '测试·爱心(加行)');
  const { error: saErr } = await sb.from('system_admins').insert({ user_id: adminUid });
  if (saErr) die('建 system_admins', saErr);
  const { error: caErr } = await sb.from('class_admins').insert([
    { cohort_id: jxCohortId, user_id: zhumaiUid, role: 'zhumai' },
    { cohort_id: jxCohortId, user_id: aixinUid, role: 'aixin' },
  ]);
  if (caErr) die('建 class_admins', caErr);
  console.log('  ✓ 角色号:1 系统管理员 + 1 辅导员(SEED_JX)+ 1 爱心(SEED_JX)');

  console.log('\n✓ 种子完成。清除:node scripts/seed_dev.mjs --clear');
  console.log('\n登录凭证(密码统一:seed-Test-00000000):');
  console.log('  学员      seed01..seed09@seed.bicwny.test(加行5 / 净土4;formal+auditor 混)');
  console.log('  系统管理员 seed10@seed.bicwny.test');
  console.log('  辅导员    seed11@seed.bicwny.test(加行班 SEED_JX)');
  console.log('  爱心      seed12@seed.bicwny.test(加行班 SEED_JX)');
}
main().catch((e) => die('未捕获错误', e));

# supabase/tests · v2.0 本地 RLS 测试

> **纯本地、一次性库**——不碰 sss-dev / 生产。守红线的核心安全测试(RLS 角色可见性)。
> ⚠️ 测的是 **v2.0 重建 schema**(本仓 `supabase/migrations/`),非 main 的基线;身份模型 = 2.0「审批门+旁听/转正」(决策136)。

## 跑
```bash
bash supabase/tests/run.sh        # 需能 createdb 的角色(如 postgres);TEST_DB=xxx 可覆盖库名
```
流程:新建临时库 → `00_pretest_stub`(模拟 Supabase auth/角色)→ 全部迁移按序 apply → `01_seed`(8 角色夹具)→ `02_rls_tests`(断言)→ 删库。任一断言 FAIL → 非零退出(可挂 CI)。

## 文件
| 文件 | 作用 |
|---|---|
| `00_pretest_stub.sql` | 本地桩:`auth.users`/`auth.uid()`(读 jwt sub)/`authenticated`·`anon`·`service_role` 角色 + 默认表权限。**迁移前跑**(迁移引用 auth)。|
| `01_seed.sql` | 夹具:admin / 本班主麦 / 本班爱心 / 正式师兄×2 / 旁听师兄 / 别班师兄 / 待审 pending + 课程/愿/打卡/关怀/5维快照/考试/升学/代行/传承。|
| `02_rls_tests.sql` | 切角色(`login(uuid)`+`SET ROLE authenticated`)断言可见性 + INSERT 权限;末尾汇总。|
| `run.sh` | 编排上面四步。|

## 覆盖的红线/决策(节选)
- ⭐ **#193**:师兄看不到关于自己的 `care_followups`、看不到 `cohort_lag_snapshot`(师兄端无状态色);师兄之间不串看愿/打卡。
- **审批门**:pending 看不到任何班级;但课程内容靠 app 路由挡、RLS 不卡(决策132)。
- **旁听/转正(决策136/003)**:旁听生能看自己班、是 active 成员、`is_formal_student=false`。
- **答案规则 083**:`question_references` 仅主麦/admin,师兄不可读。
- **出勤后台录入 094/135**:师兄不能自报 `group_attend`;主麦/admin 可后台录入;闻思 `listen` 师兄可自报。
- **打卡强归属**:师兄只能在自己的愿上打卡。
- 管理者(主麦/爱心/admin)可见本班关怀/快照/愿/参考答案。

## CI
- ✅ **已挂 GitHub Actions**:`.github/workflows/db-rls-tests.yml`——改 `supabase/**` 自动起 Postgres 16 跑 `run.sh`(也可手动 `workflow_dispatch`)。纯一次性库、不碰线上。
- ⚠️ 本分支无 app 代码(package.json 在 main),CI 暂只跑 DB/RLS;**lint/tsc/app 测待与 app 代码同处再加**。

## 注意 / 待扩
- 这是 **DDL+RLS 行级**验证(结构正确 + 角色行级可见性),**不替代**业务语义人工核(铁律:测试通过≠语义对)。
- `auth.uid()`/角色是**本地桩**;生产/sss-dev 用 Supabase 自带的,行为一致(读 jwt sub)。
- 待扩:列级(current_status 师兄端不投影,RLS 不做列级、靠 app)、UPDATE/DELETE 审核态(is_confirmed)更多分支、jest+RNTL app 测。

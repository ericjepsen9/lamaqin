-- ============================================================
-- 20260618000090_aux · §6.10 辅助内容（藏历/push）+ 域⑧ 新增（banner/反馈/短信日志）
-- audit_logs 已在 000015。v2.0 delta：+home_banners(116)/feedback(117)/sms_log(116)；
--   ⭐ 藏历采觉学方案（决策137）：废 tibetan_calendar+buddhist_days 两表 → 建 tibetan_days(觉学 TibetanDay 模型)。
-- 殊胜日时区=UTC+8 固定（075·app 层算"今天"，非本表字段）；push 提前 v1.0（062/068）。
-- 依赖：000010（profiles/helpers）。
-- ============================================================

-- ⭐ tibetan_days · 藏历（觉学 TibetanDay 模型·决策137；替代原 tibetan_calendar+buddhist_days）
-- 数据导入觉学 TibetanDay（公历↔农历↔藏历 + tags/auspicious/events/假日）；藏历/殊胜日纯展示·不影响计数。
-- ⚠️ 字段按觉学能力40 描述建模；**精确 Prisma 字段 + 导入映射实现期拿觉学 repo 对**。
CREATE TABLE tibetan_days (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gregorian_date     date NOT NULL UNIQUE,                 -- 公历日（唯一·觉学 date @unique）
  tibetan_year       int,
  tibetan_month      int CHECK (tibetan_month IS NULL OR tibetan_month BETWEEN 1 AND 13),  -- 含闰
  tibetan_day        int CHECK (tibetan_day IS NULL OR tibetan_day BETWEEN 1 AND 31),
  tibetan_month_name text,                                 -- 萨嘎月 / 苦行月…
  is_leap_month      boolean DEFAULT false,
  lunar_date         text,                                 -- 农历（可选）
  tags               text[] DEFAULT '{}',                  -- 十斋日/飞幡日/八吉同聚/九凶同聚
  is_auspicious      boolean DEFAULT false,                -- 修法功德日 🌺
  events             jsonb,                                -- 圣诞/法会/加持日 [{type,name,…}]
  public_holiday     text,                                 -- 公历假日
  notes              text,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX idx_tibetan_days_date ON tibetan_days(gregorian_date);
CREATE INDEX idx_tibetan_days_auspicious ON tibetan_days(gregorian_date) WHERE is_auspicious;

CREATE TABLE user_push_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  device_info     text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_user_push_tokens_user_active ON user_push_tokens(user_id, is_active);
CREATE TRIGGER user_push_tokens_updated_at_trigger
  BEFORE UPDATE ON user_push_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- home_banners · 首页法讯 banner（116·静态展示、非推送·守克制）
CREATE TABLE home_banners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  image_url     text,
  link          text,
  start_date    date,
  end_date      date,
  is_active     boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_home_banners_active ON home_banners(is_active, display_order);

-- feedback · 用户反馈（117 + 能力47 法本纠错入口）
CREATE TABLE feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('bug','suggestion','text_correction','other')),
  content    text NOT NULL CHECK (length(content) > 0),
  status     text DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','closed')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE INDEX idx_feedback_status ON feedback(status);

-- sms_log · 短信日志（116/068·仅 critical 级·控成本防骚扰）
CREATE TABLE sms_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  phone      text NOT NULL,
  template   text,
  sent_at    timestamptz DEFAULT now(),
  status     text
);
CREATE INDEX idx_sms_log_user ON sms_log(user_id, sent_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE tibetan_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_banners     ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log          ENABLE ROW LEVEL SECURITY;

-- 藏历（觉学 TibetanDay 模型）：任意登录读 / admin 写
CREATE POLICY tibetan_days_select ON tibetan_days FOR SELECT TO authenticated USING ( true );
CREATE POLICY tibetan_days_write  ON tibetan_days FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_push_tokens：自己
CREATE POLICY user_push_tokens_all ON user_push_tokens FOR ALL TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );

-- home_banners：is_active 任意登录读 / admin 写
CREATE POLICY home_banners_select ON home_banners FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
CREATE POLICY home_banners_write  ON home_banners FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- feedback：访问规则 = 自己读自己 + admin 读全部；自己提交；admin 改状态
CREATE POLICY feedback_select ON feedback FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY feedback_insert ON feedback FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
CREATE POLICY feedback_update ON feedback FOR UPDATE TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY feedback_delete ON feedback FOR DELETE TO authenticated USING ( is_system_admin() );

-- ⭐ sms_log：仅 admin 读；写 = admin/系统(service_role)
CREATE POLICY sms_log_select ON sms_log FOR SELECT TO authenticated USING ( is_system_admin() );
CREATE POLICY sms_log_write  ON sms_log FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

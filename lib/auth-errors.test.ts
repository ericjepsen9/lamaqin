import { isEmailTakenError } from './auth-errors';

describe('isEmailTakenError · 注册"邮箱已被占用"判定(2026-07-15发现)', () => {
  it('干净路径:code=email_exists → 已占用', () => {
    expect(isEmailTakenError('email_exists', 'User already registered')).toBe(true);
  });
  it('干净路径:code=user_already_exists → 已占用', () => {
    expect(isEmailTakenError('user_already_exists', 'User already registered')).toBe(true);
  });
  it('PM实测复现的脏路径:unexpected_failure + "Database error finding user" → 判定为已占用', () => {
    expect(isEmailTakenError('unexpected_failure', 'Database error finding user')).toBe(true);
  });
  it('大小写不敏感(message比较不区分大小写)', () => {
    expect(isEmailTakenError('unexpected_failure', 'DATABASE ERROR FINDING USER')).toBe(true);
  });
  it('同是unexpected_failure但message对不上 → 不是已占用,原样报错(不能什么500都吞成这句话)', () => {
    expect(isEmailTakenError('unexpected_failure', 'Database error saving new user')).toBe(false);
    expect(isEmailTakenError('unexpected_failure', 'Unexpected error')).toBe(false);
  });
  it('其它不相关错误 → 不是已占用', () => {
    expect(isEmailTakenError('weak_password', 'Password should be at least 8 characters')).toBe(false);
    expect(isEmailTakenError('over_email_send_rate_limit', 'Too many requests')).toBe(false);
  });
  it('code缺失(如请求发出前就失败)→ 不是已占用', () => {
    expect(isEmailTakenError(undefined, 'Network request failed')).toBe(false);
  });
});

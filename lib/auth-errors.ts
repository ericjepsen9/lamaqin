// 注册"邮箱已被占用"判定(2026-07-15发现):GoTrue 报这件事有两种表现——
//   ①正常路径:该邮箱已通过常规signUp/邀请建过 → code 'email_exists' / 'user_already_exists'。
//   ②该邮箱已存在于auth.users但不是走常规signUp建的(如批量导入的老学员账号)→ GoTrue走的是
//     另一条内部查重路径,报的是500 'unexpected_failure' + "Database error finding user",
//     不是干净的409/422(PM实测复现:用已导入老学员的邮箱重新注册,页面直接显示这句原始英文
//     报错,吓退师兄)。两种情况对用户而言是同一件事:这个邮箱已经能登录、不能再注册一个新的,
//     文案该统一。
// ②只用code+message双重匹配缩小范围,不単凡是unexpected_failure就当"已注册"——避免真的
//   数据库抖动之类的其它未知失败被误导性地吞成这句话。
export function isEmailTakenError(code: string | undefined, message: string): boolean {
  return (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    (code === 'unexpected_failure' && /finding user/i.test(message))
  );
}

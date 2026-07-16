// Mailpit:本地栈内置假邮件收发服务,真实HTTP端口54324(supabase/config.toml [local_smtp],
// 不发真邮件、只落库+提供REST API读)。
// ⚠️ 2026-07-16真机CI两轮实测才发现真身:config.toml里仍叫"local_smtp"/习惯上会说
// "Inbucket"是历史命名——Supabase CLI 2.x(这里是2.109.0)早就把底层从Inbucket换成了
// Mailpit,REST API完全不同(不是/api/v1/mailbox/{name},实测第一轮打过去是404;而是
// /api/v1/messages列表 + /api/v1/message/{id}详情,支持{id}="latest"取最新一条),
// 消息字段是Go结构体直出、没有json tag,字段名大写:ID/From/To/Subject/Text/HTML,不是
// 小写的id/body.text/body.html。经查axllent/mailpit源码(server/apiv1/messages.go +
// internal/storage/structs.go)确认。
const MAILPIT_URL = 'http://127.0.0.1:54324';

type MailAddress = { Address?: string };
type MessageSummary = { ID: string; To?: MailAddress[] };
type MessagesList = { messages?: MessageSummary[] };
type FullMessage = { Text?: string; HTML?: string; To?: MailAddress[] };

function extractOtp(text: string): string | undefined {
  // 模板固定"验证码是:"紧跟{{ .Token }}(见supabase/templates/confirmation.html),优先按
  // 这个锚定关键词找码;万一自定义模板没生效,退而找"独立的6位数字"兜底。
  const match = text.match(/验证码是[^\d]*?(\d{6})/) ?? text.match(/\b(\d{6})\b/);
  return match?.[1];
}

async function fetchMessageBody(id: string): Promise<FullMessage | undefined> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${encodeURIComponent(id)}`);
  if (!res.ok) return undefined;
  return (await res.json()) as FullMessage;
}

// GoTrue发信到Mailpit落库中间有几十到几百毫秒延迟,不是瞬时的——轮询而非一次性GET。
// playwright.config.ts是workers:1(全套测试单worker串行),同一时刻只有这一条测试在跑,
// 理论上"latest"就是它刚触发的这封信——但仍核对一遍收件人再采信,不假设时序一定不会巧合;
// 核对不上时退而列表按收件人查找(不依赖列表的排序方向,线性找收件人匹配的第一条)。
export async function fetchLatestOtpCode(email: string, opts: { timeoutMs?: number; pollIntervalMs?: number } = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastDebug = '(从未成功请求到任何接口)';
  while (Date.now() < deadline) {
    const latest = await fetchMessageBody('latest');
    if (latest?.To?.some((a) => a.Address === email)) {
      const code = extractOtp(`${latest.Text ?? ''}\n${latest.HTML ?? ''}`);
      if (code) return code;
      lastDebug = `latest消息收件人对上了,但两种正则都没匹配到6位码,正文前300字:${`${latest.Text ?? ''}${latest.HTML ?? ''}`.slice(0, 300)}`;
    } else {
      const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
      if (!listRes.ok) {
        lastDebug = `GET /api/v1/messages 返回 HTTP ${listRes.status}`;
      } else {
        const { messages = [] } = (await listRes.json()) as MessagesList;
        const match = messages.find((m) => m.To?.some((a) => a.Address === email));
        if (!match) {
          lastDebug = `messages列表共${messages.length}条,没有一条收件人是${email}`;
        } else {
          const full = await fetchMessageBody(match.ID);
          const code = full ? extractOtp(`${full.Text ?? ''}\n${full.HTML ?? ''}`) : undefined;
          if (code) return code;
          lastDebug = `按收件人在列表里找到了信(id=${match.ID}),但取详情或正则匹配失败`;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`未能在 ${timeoutMs}ms 内从 Mailpit 取到 ${email} 的验证码邮件。最后一次诊断:${lastDebug}`);
}

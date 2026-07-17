#!/usr/bin/env node
// ============================================================
// RN 原生渲染/键盘坑位检测(三易·易维护护栏)——防两类"Web 端测不出、真机才炸"的问题复发:
//   1) 弹窗(Modal)里有输入框(TextInput)却没包 KeyboardAvoidingView →
//      真机键盘弹出后挡住输入框/按钮(2026-07-17 PM 真机复现,"调整节奏"弹层)。
//      Web 端(Playwright/Chromium)没有软键盘概念,这类问题在 CI 里必然是绿的——
//      唯一能防复发的办法是在源码层面挡住这个反模式,而不是指望多写几条 e2e。
//   2) 7 等分网格用 `${100 / 7}%` 算宽度 → 安卓 Yoga 引擎浮点误差累计超 100%,
//      flexWrap 提前换行、丢一整列(2026-07-17,藏历页周六列消失)。同理,Chromium 的
//      CSS 引擎舍入方式不同,这个 bug 在浏览器里复现不出来。
//
// 用法:node scripts/check-rn-ui-pitfalls.mjs   (CI 硬门禁:发现新违规 → 退出 1)
// ============================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const APP_DIRS = ['app', 'components'].map((d) => join(ROOT, d));

// 已知"有意暂不改"的例外:登记 相对路径 → 理由。新违规不在此列 → CI 失败。
const MODAL_KEYBOARD_WHITELIST = [];
const PERCENT_DIVISION_WHITELIST = [];

function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e !== 'node_modules') walk(p, exts, out); }
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

const files = APP_DIRS.flatMap((d) => walk(d, ['.tsx']));
const errors = [];

for (const f of files) {
  const rel = f.slice(ROOT.length + 1);
  const text = readFileSync(f, 'utf8');

  // 1) 裸 <Modal ...> (排除 <ModalField/<ModalActions/<ModalFootnote 等共享组件名前缀撞词)
  //    + <TextInput,却没 KeyboardAvoidingView。共享的 AdminModal(components/ui/admin-kit.tsx)
  //    已在组件内部包好,消费方(用 <AdminModal>+<ModalField>)不算裸 Modal,天然不会命中。
  const hasRawModal = /<Modal[\s>]/.test(text);
  const hasTextInput = /<TextInput[\s>]/.test(text);
  const hasKAV = /KeyboardAvoidingView/.test(text);
  if (hasRawModal && hasTextInput && !hasKAV && !MODAL_KEYBOARD_WHITELIST.includes(rel)) {
    errors.push(`${rel}: 含 <Modal> + <TextInput> 但没有 KeyboardAvoidingView——真机键盘会挡住输入框(2026-07-17 教训)`);
  }

  // 2) `${100 / N}%` 这种无限小数百分比宽度(7 等分最常见,但不限于 7)。
  if (/\$\{\s*100\s*\/\s*\d+\s*\}%/.test(text) && !PERCENT_DIVISION_WHITELIST.includes(rel)) {
    errors.push(`${rel}: 用 \${100 / N}% 算宽度——安卓浮点误差会让 flex-wrap 提前换行(2026-07-17 教训);改用手动取整的百分比字符串或 flex:1(不换行的单行)`);
  }
}

if (errors.length > 0) {
  console.error('发现 RN 原生渲染/键盘坑位(Web 端测不出,真机才炸):\n');
  errors.forEach((e) => console.error(`  - ${e}`));
  console.error('\n确认是新场景、非误报 → 直接修;确认是误报(如 Modal 和 TextInput 确实无关)→ 登记进本脚本的 WHITELIST 并写明理由。');
  process.exit(1);
} else {
  console.log(`RN UI 坑位检测通过(${files.length} 个文件)。`);
}

# sss-app 开发上手(给 Eric)

> 目标:**笔记本改代码 → iPhone 实时看效果,人在路上、用流量也行。**
> 你写代码用 Claude Code 即可;本项目规则在仓库根 `CLAUDE.md`。

---

## 0 · 一句话原理
本项目是 **Expo SDK 56**,商店版 Expo Go(只到 SDK 54)**打不开**——所以我们用一个**专属开发版 App(dev build)**装在你 iPhone 上。装一次,以后改 JS 不用重装;笔记本起 dev 服务器,手机用 **tunnel(隧道)**连,**不需要同一 Wi-Fi**。

---

## 1 · 笔记本一次性准备(跟 Apple 无关)

1. **装 Node 22**(nodejs.org LTS;有 `node -v` 显示 v22.x 即可)。
2. **克隆私有仓库**(需 GitHub 授权——最省事装 **GitHub Desktop** 登录有权限的账号克隆;命令行同理):
   ```bash
   git clone https://github.com/BICW-NY/sss-app.git
   cd sss-app
   # 默认分支 main 就是当前开发分支,无需切
   ```
3. **装依赖**(第一次几分钟):
   ```bash
   npm install
   ```
4. **建 `.env`**(预览模式:直接进首页、跳过登录;**不需要任何密钥**):
   ```bash
   echo "EXPO_PUBLIC_PREVIEW=1" > .env
   ```
   > 以后要连**真数据**(sss-dev)再找 admin 要 `EXPO_PUBLIC_SUPABASE_ANON_KEY` 填进 `.env`。日常 UI 开发用不到。

---

## 2 · 把开发版 App 装进 iPhone(一次性,iOS 必经)

iOS 规定:内部分发 App **只能装在已登记的设备**上。所以顺序是:

1. **登记你的 iPhone**:admin 发你一个**设备注册链接**(由 `eas device:create` 生成)→ 你**在 iPhone 上打开**,装一个描述文件 → 你的设备 UDID 就登记进开发者账号了。
2. **装 dev build**:admin 收到你登记后,**重出一个含你设备的开发版**,发你一个**安装链接** → iPhone 打开链接 → Install。
3. **信任开发者**(若提示"未受信任"):**设置 → 通用 → VPN与设备管理** → 信任。

> ⚠️ 你**不能**直接拿别人的旧安装链接装——你的设备不在那个包的签名里。必须走上面 1→2。

---

## 3 · 日常开发循环(路上用)

每次开发,在项目目录:
```bash
npx expo start --dev-client --tunnel
```
- 第一次会装隧道包(ngrok),约 20–30 秒,正常。
- 终端出现**二维码 + 一个 `exp://…exp.direct` 网址**。
- iPhone 打开**装好的开发版 App** → 扫二维码(或点 "Enter URL manually" 粘贴那个网址)。
- **手机用 4G/5G 或任意 Wi-Fi 都能连**(隧道走公网,比同网慢一点点,正常)。
- 改代码保存 → App 自动热重载。

用 Claude Code:项目目录里跑 `claude`,先让它读 `CLAUDE.md`(项目铁律 + 技术栈)。

---

## 4 · 常见卡点

| 现象 | 原因 / 解决 |
|---|---|
| App 装不上(无法安装) | 你的设备没登记 / build 没含你设备 → 找 admin 重出(见 §2) |
| 扫码连不上、转圈 | 确认用的是 `--tunnel`;等隧道完全起来;App 用的是 **dev build** 不是商店 Expo Go |
| 停在登录页、进不了首页 | `.env` 少了 `EXPO_PUBLIC_PREVIEW=1` |
| 商店版 Expo Go 扫码打不开 | 本项目 SDK 56,商店 Expo Go 只到 54——**必须用 dev build**(这就是 §2 的意义) |
| Windows:git/npm 输出一片红 | 别用 PowerShell ISE,换 Windows Terminal / cmd;私有库克隆用 GitHub Desktop |

---

## 5 · 谁负责什么

| 事 | 谁 | 要 EAS/Apple 权限? |
|---|---|---|
| clone / npm install / `.env` / 跑 tunnel / 写代码 | **Eric 自己** | ❌ 不要 |
| 登记 Eric 设备(`eas device:create`)+ 出 dev build | **admin** | ✅ 要 |

> 想让 Eric 自己也能出 build:把他加进 `bicwny` 的 Expo 组织即可。否则 build 由 admin 代出、发链接给他,Eric 零账号负担、纯写代码。

# 网页预览部署(自动预览网址)

> 目的:连一次仓库,以后每次推送自动构建网页版、出一个最新网址,PM 点链接即可逐页看 UI。
> 适配「觉学 UI 逐页讨论」节奏(决策138)。**一次性设置,之后免维护。**

## ⭐ 当前配置 = 真数据登录版(2026-06-21 起)
`netlify.toml` 已从「预览模式」切到「真登录 + sss-dev 真数据」:`EXPO_PUBLIC_PREVIEW="0"`(根 `/` 走登录闸门)、`EXPO_PUBLIC_SUPABASE_URL` 指向 sss-dev。**唯一要在托管后台手填的是 anon key**(见下「接真数据」)。
- 想回到「无登录、纯 UI、渐变兜底」预览:把后台/文件里的 `EXPO_PUBLIC_PREVIEW` 改回 `"1"` 即可。
- 登录账号:在 Supabase(sss-dev)的 Authentication → Users 建用户 + `profiles` 表有对应行(`id`=该用户 UID、`status='active'`)。

## 看哪条分支
当前开发分支 = `claude/focused-hamilton-000nc8`(在托管后台把「生产分支/Production branch」设成它)。

## 方案 A · Netlify(最省事,已带 netlify.toml)
1. https://app.netlify.com 用 GitHub 登录 → **Add new site → Import an existing project** → 选 `bicw-ny/sss-app`。
2. **Branch to deploy** 设为 `claude/focused-hamilton-000nc8`(构建命令/输出目录由仓库根 `netlify.toml` 自动带入,无需手填)。
3. Deploy → 得到网址 `https://<名字>.netlify.app`。

## 方案 B · Cloudflare Pages
1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → 选仓库。
2. **Production branch** = `claude/focused-hamilton-000nc8`。
3. 构建设置:Build command `npx expo export --platform web`;Output directory `dist`;环境变量 `NODE_VERSION=22`、`EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`、`EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key`。
4. Deploy → 得到 `https://<项目>.pages.dev`。

## 方案 C · 本地 + Expo Go(真机原生效果,最准)
> 需一台电脑跑 dev 服务器,手机扫码连。看真磨砂玻璃/手势/字体最准。适合 Eric 或装了 node 的人。

> ⚠️ **当前被 SDK 版本卡住(2026-06)**:商店版 Expo Go 目前只支持 **SDK 54**(SDK 55 还在苹果审核、SDK 56 未进商店),而本项目是 **SDK 56** → **现在用商店版 Expo Go 扫码打不开本 App**。
> **本项目决定:等商店版 Expo Go 跟上 SDK 56 后再走这条**——届时扫码即恢复,步骤不变,无需改代码。在此之前:① 电脑本地按 `w` 看**网页版**(见下方步骤)不受影响;② 真机现在就要看原生 → 走**方案 E**。

**前提**:① 电脑装 Node.js LTS(nodejs.org 下载,一路下一步)② 手机装 **Expo Go**(App Store / Play 商店搜;⚠️ 须等商店版支持 SDK 56 才能扫码,见上)③ 手机和电脑连**同一 Wi-Fi**。

**步骤(电脑终端)**:
```bash
git clone https://github.com/bicw-ny/sss-app.git
cd sss-app
git checkout claude/focused-hamilton-000nc8
npm install                       # 第一次,几分钟
echo "EXPO_PUBLIC_PREVIEW=1" > .env   # 预览模式:直接进首页(跳过登录闸门)
npx expo start                    # 终端出现二维码
```
**手机**:iPhone 用相机扫二维码 / Android 打开 Expo Go 扫 → App 在手机上打开,**直接进首页**,底部 5 个 tab 都能点着逐页看。
> ⚠️ 扫码这一步**目前对 SDK 56 不可用**(商店版 Expo Go 仅 SDK 54)。未跟上期间:电脑终端按 `w` 看网页版,或走**方案 E** 在真机看原生。

- **手机和电脑不在同一网络 / 扫不上**:改用 `npx expo start --tunnel`(第一次会装隧道包;之后手机在任何网络都能连)。
- `.env` 里 `EXPO_PUBLIC_PREVIEW=1` 是关键——没它会停在登录页(认证还没接)。

### ⚠️ Windows 注意
- **别用 PowerShell ISE**:它会把 git/npm 的正常进度信息(走 stderr 的「Cloning into…」)显示成**红色"错误"**,其实没失败。换 **Windows Terminal** 或**命令提示符 cmd**。
- 克隆后先确认成功:`dir sss-app`(或文件资源管理器看有没有 `sss-app` 文件夹)。有就是成功了。
- **私有仓库要登录**:`bicw-ny/sss-app` 是私有库,克隆需 GitHub 授权。最省事=装 **GitHub Desktop**(图形界面)登录有权限账号 → 克隆 → 切分支 `claude/focused-hamilton-000nc8` → 在该文件夹开终端。
- 建 `.env`(cmd):`echo EXPO_PUBLIC_PREVIEW=1> .env`(注意别带空格、别存成 `.env.txt`)。

## 方案 D · 自己的服务器(nginx 静态托管 · 自有服务器首选)
> 觉学已有服务器(nginx)。网页版导出后是**纯静态文件**(HTML/JS/CSS),服务器只要能托管静态文件即可,**不用装 Node 运行时**,也不碰 Expo Go/SDK 版本。手机 5G 用域名直接开。

1. 在已克隆的机器(或服务器上)构建:
   ```bash
   npx expo export --platform web    # 生成 dist/;确保 .env 有 EXPO_PUBLIC_PREVIEW=1(导出时内联→开在首页)
   ```
2. 把 `dist/` 整个传到服务器(scp 或现有部署方式)。
3. nginx 指向它——**用子域名或独立根目录,别放子路径**(否则 `/_expo/...` 资源会 404):
   ```nginx
   server {
     server_name preview.你的域名;
     root /var/www/sss-preview;          # = dist 的内容
     location / { try_files $uri $uri.html $uri/ /index.html; }
   }
   ```
   (`$uri.html` 让 `/home` 命中 `home.html`;expo 静态导出每个路由都是真 .html。)
4. 手机 Safari 打开 `https://preview.你的域名/` → 直接进首页。
5. 更新:服务器 `git pull` + 重新 `npx expo export --platform web` + 覆盖 dist(或 dev 机导出后 scp)。

> 若必须放子路径(如 `/preview/`):导出前在 `app.json` 设 `experiments.baseUrl="/preview"` 再 export。用子域名/根目录最省事。

## 方案 E · 真机"现在就要"看原生(绕开商店 Expo Go 的 SDK 限制)
> 适用:不等商店版 Expo Go,现在就要在真机看磨砂/手势/原生效果。需装了 EAS 的人操作(`npm i -g eas-cli` → `eas login`;项目已有 projectId,见 [app.json](../app.json))。具体命令参数以 EAS 官方文档为准。

**Android(最省事 · 免费 · 无需任何付费账号)**
- `eas go`(EAS CLI 命令,轻量):生成"我们专属的 Expo Go(SDK 56)",装上后扫码连本地 dev 服务器、可热更新。
- 或 **Dev Client**(更接近正式 App):`eas build --profile development --platform android` → 得到 APK → 装手机 → 扫码连 dev 服务器。

**iOS(需 Apple 账号或蹭公测)—— 三选一**
1. **Expo Go 公测版**(免费):Expo 官方 TestFlight 外部 Beta 含 SDK 56。⚠️ 名额(上限约 1 万)/有效期会变,用前实测 TestFlight 链接是否还开。
2. **`eas go` + 自有 TestFlight**:把"专属 Expo Go"传到自己的 TestFlight。**需 Apple Developer Program($99/年)**。
3. **Dev Client**:`eas build --profile development --platform ios` 出开发版,经 TestFlight / Ad-hoc 装机。**同样需 $99 账号**。

> **`eas go` vs Dev Client 怎么选**:纯看 UI 预览 → `eas go` 更轻;**将来接认证(深链回跳 `scheme: sanshusheng`)或加 Expo Go 不带的原生模块 → 必须 Dev Client**,那是终点,不是临时预览手段。

## 怎么看页面
- **真数据登录版(当前)**:打开网址根 `/` → 登录页 → 用 sss-dev 账号登录 → 按 `profiles.status` 分流(active 师兄→首页 / pending→待审核 / 管理角色→管理端)。登录后页面间用 App 内导航点进去最稳。
- 直接敲静态路由也行:`/courses`、`/practice`、`/class`、`/me`、`/login`、`/pending` 等(各是真 .html)。动态详情页(`/lesson/<id>`)别直接刷新(静态托管会 404),从首页点进去。
- 真值依赖 sss-dev 数据:月度画报需 `home_posters` 有行;藏历/法名/活动等表有数据才显真值,空表则相应区域为空/兜底。

## 接真数据(现在就做)
sss-dev 已有 2.0 表结构。`netlify.toml` 已写好 `EXPO_PUBLIC_PREVIEW="0"` + sss-dev 的 URL,**只差 anon key**(密钥不进仓库,故只在后台填):

1. Netlify 后台 → **Site configuration → Environment variables → Add a variable**
2. Key = `EXPO_PUBLIC_SUPABASE_ANON_KEY`,Value = sss-dev 的 **anon public** key(Supabase → Project Settings → API)。
3. **Trigger deploy / Clear cache and deploy**(改环境变量要重新构建才生效)。
4. 打开网址 → 停在登录页 → 用 sss-dev 里建好的账号登录 → 进师兄端首页看真数据。

> 代码不写死,纯靠环境变量切;将来连生产 `sss` 只需在(另一个)后台把 URL/KEY 换成 sss 的值。
> ⚠️ anon key 是「公开」key(防线靠 RLS),但公开网址=任何人可达 → **公开预览只用 sss-dev,别用生产 sss**;且确保 RLS「读必须登录」生效。

## 备注
- Expo 静态导出**每个路由都是真 .html**(`home.html`/`login.html`…),托管无需 SPA 回退重写。
- 构建命令也可用 `npm run build:web`(= `expo export --platform web`)。
- 沙箱里无法长期托管(临时环境会回收),故走外部托管;本地临时看可 `npx expo start`(按 w 看网页 / Expo Go 扫码看真机——后者目前需商店版 Expo Go 支持 SDK 56,未跟上前见方案 C/E)。

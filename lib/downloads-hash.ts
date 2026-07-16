// 离线下载文件名派生——纯函数,不碰文件系统,便于单测(同 query-persist-allowlist.ts 先例)。
// 同一 URL 每次算出同一本地文件名,用来判断"是否已下载过"而不需要额外维护 URL→文件名的映射表。
export function hashUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h + url.charCodeAt(i)) | 0; // djb2: h*33 + c
  }
  return (h >>> 0).toString(36);
}

export function extensionFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(clean);
  return m ? `.${m[1].toLowerCase()}` : '';
}

export function localFileNameFor(url: string): string {
  return `${hashUrl(url)}${extensionFromUrl(url)}`;
}

# 浏览器与客户端最小接入

这是源码修复说明，不代表已发布 npm 新版本或 Sen/Hills 已接入。

浏览器使用 `danmux/core`（或支持 browser export condition 的根入口），不再导入 Node 的资源解析器。Node 资源下载单独使用 `danmux/assets`；原有 Node 根入口继续可用。

```js
import { gradientToCss } from 'danmux/core';
const effect = comment.danmux?.effects?.find(e => e.type === 'gradient' && e.target === 'fill');
const css = effect && gradientToCss(effect);
// css?.ok 时使用 css.value；否则按原有 p/m 渲染基础颜色。
```

`gradientToCss` 返回 Result，仅支持合法 linear fill。DanmuX 0°向右、顺时针；CSS 转换为 angle+90°。纹理和描边不由此助手渲染，不能把“数据保留”当作“画面支持”。调试台明确显示降级诊断，不远程加载纹理。

资源解析器增加 `dnsTimeoutMs` 和 `maxCacheEntries`。DNS 验证尚未绑定实际连接，图像尺寸检查不是完整解码；生产部署仍需要可信主机白名单/受控出口和客户端解码校验，详见 SECURITY.md。

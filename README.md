# DanmuX v1

DanmuX v1 是一个平台无关的弹幕数据标准参考实现。它把平台原始弹幕归一化为 `Base + Effects + Source`，并将 DanDanPlay 保留为兼容输出，而不是内部核心模型。

当前实现覆盖审批修订版任务书要求的标准骨架：双层版本、Base 校验、`gradient`（`texture` / `linear`）、B 站原生渐变适配、普通弹幕人工渐变、DanDanPlay fallback、Enhanced Extension、未知效果隔离、聚合幂等、Asset Resolver 安全边界、能力协商、结构化诊断和测试。v0.2 起吸收 `xlmc/danmu_api` 实际链路经验，兼容其四字段 JSON 与 Bilibili 8/9 字段 XML，并直接接受 protobuf parser 的 `progress/mode/fontsize/color_v2` 字段。

播放器接入、具体渲染技术、BAS/mode 8/mode 9、动态渐变和其他平台原生高级特效不在 v1 范围内。

## 快速开始

要求 Node.js 20+，项目无运行时依赖：

```bash
npm test
npm run check
```

```js
import {
  createDanmuX,
  fromBilibili,
  applyGradient,
  toCompatibilityWire,
} from 'danmux-v1';

const ordinary = createDanmuX({
  id: 't-1',
  time: 12.5,
  text: 'hello',
  mode: 'scroll',
  fontSize: 25,
  color: 0xffffff,
  source: { platform: 'tencent', id: 't-1' },
});

const enhanced = applyGradient(ordinary.value, { preset: 'pink-blue' }).value;
const wire = toCompatibilityWire(enhanced);
// wire.p / wire.m 保持 DanDanPlay Base；wire.danmux.effects 是可选增强层。
```

## 双层格式

内部 Model 使用 `schemaVersion`，对外兼容增强层使用 `extensionVersion`，二者不共用 `version`：

```json
{
  "schemaVersion": 1,
  "id": "123",
  "time": 12.5,
  "text": "渐变弹幕",
  "mode": "scroll",
  "fontSize": 25,
  "color": 16777215,
  "source": { "platform": "bilibili", "id": "xxx" },
  "effects": [
    {
      "type": "gradient",
      "origin": "native",
      "target": "fill",
      "source": { "type": "texture", "uri": "https://cdn.example.test/fill.png" }
    }
  ]
}
```

普通弹幕不输出 `effects`。`Base.color` 始终是降级基准；不支持 Enhanced 的客户端只读取 `p+m`，仍显示单色弹幕。

兼容线格式为：

```json
{
  "p": "12.5,1,16777215,[bilibili]",
  "m": "渐变弹幕",
  "danmux": {
    "extensionVersion": 1,
    "effects": [
      {
        "type": "gradient",
        "target": "fill",
        "source": { "type": "texture", "uri": "https://cdn.example.test/fill.png" }
      }
    ]
  }
}
```

默认 `ddplay-json` profile 的 `p` 顺序为 `time,mode,color,source`，与 `danmu_api` 现有 JSON 链路一致。`bilibili-xml` profile 使用 `time,mode,fontSize,color,timestamp,pool,userHash,id`。两种 profile 都不会把渐变塞进 `p`；旧客户端继续消费 `p+m`，支持 DanmuX Gradient v1 的客户端只需额外读取 `danmux.effects`。

```js
toDanDanPlay(item); // 12.5,1,16777215,[bilibili]
toDanDanPlay(item, { profile: 'bilibili-xml' }); // 12.5,1,25,16777215,0,0,0,id
```

## Gradient Semantics v1

- `target=fill` 只作用于文字填充，`target=stroke` 只作用于文字描边。
- `texture` 表示目标层的纹理/样式资源，不能误解成 RGB stop。
- `linear.angle=0` 表示目标文字框从左到右，正角度顺时针；坐标空间是目标层包围盒。
- `linear.stops` 有 2–16 个，位置在 `0..1`；规范化时按位置稳定排序，边界采用 clamp。
- stop 颜色为 `#RRGGBB`，`alpha` 为 `0..1`，省略时默认为 `1`。
- 单个 effect 失败只丢弃该 effect；未知 effect/source 必须“忽略效果，不忽略弹幕”。

## 适配与转换

`fromBilibili()` 会把 B 站 `color_v2` / `colorfulSrc` 的填充或描边纹理映射为 `origin=native` 的 gradient，并把 protobuf 的毫秒 `progress`、数字 mode 和 `fontsize` 规范化到 Base；格式异常时保留 Base，并生成 namespaced `vendor=bilibili` fallback。`applyGradient()` 只生成 `origin=generated` 的 linear gradient，preset 只是生成器配置，不会进入协议核心。内置 `bilibili`、`sweet`、`cyber`、`sunset`、`ocean`、`mint`、`rainbow` 等皮肤，原生效果优先于同 target 的 generated 效果。

`aggregate()` 按 `source.platform + source.id + id` 去重，并在冲突时保留 native gradient。Transformer 是纯函数、可重复执行的；generated preset 不会覆盖 native effect。

## 资源安全

远程纹理必须通过 `AssetResolver`。默认限制包括：仅 HTTPS、DNS 地址检查、拒绝 localhost/环回/内网/云 metadata 主机、可选 host allowlist、拒绝重定向、流式字节上限、像素上限、图片 MIME、超时和可选 SHA-256 校验。下载失败时调用方必须继续使用 Base fallback。生产环境仍建议使用受控出站代理或 host allowlist，以避免 DNS rebinding，并增加完整图片解码与内容扫描。

## 能力协商与观测

`negotiateCapabilities()` 按 effect/source/target 细分返回已支持和未支持能力。建议将返回结果随 Enhanced 响应发送。`createMetrics()` 可记录 `parse_fail`、`effect_drop`、`vendor_count`、`asset_fail`、`fallback_count` 和 `loss_report` 等结构化指标；日志不要直接输出 raw 敏感字段。

## 目录

```text
src/
  danmu.js                       Base、构造器、校验、稳定身份
  effects/gradient.js            Gradient Schema 规则与规范化
  adapters/bilibili-danmu.js     B 站原始字段 → DanmuX
  adapters/dandanplay.js         DanmuX ↔ DanDanPlay / Enhanced Wire
  transformers/gradient-presets.js  generated linear gradient
  pipeline/aggregate.js          去重、合并、native 优先
  assets/resolver.js             资源协议、MIME、大小、超时和 hash 安全
  capabilities.js                Level 0/1 细粒度能力协商
schema/                          JSON Schema
types/                            TypeScript 类型定义
fixtures/                         golden 输入样例
test/                              单元、转换、安全和回归测试
```

## Conformance 状态

本仓库是可运行的内部参考实现/原型，包含 T1–T22 的主要代码骨架和负向测试，但没有宣称替代真实平台采集器、播放器或生产级图片解码器。完成实际项目接入前，应把真实 Bilibili protobuf fixture、下游客户端矩阵、属性/模糊测试、真实缓存链路以及 feature flag/canary/shadow 发布流程接入 CI。

## License

MIT

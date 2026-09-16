# DanmuX v1

[English](README.en.md) · [贡献指南](CONTRIBUTING.md) · [路线图](ROADMAP.md) · [安全策略](SECURITY.md) · [变更记录](CHANGELOG.md)

[![CI](https://github.com/xlmc/danmux/actions/workflows/test.yml/badge.svg)](https://github.com/xlmc/danmux/actions/workflows/test.yml)

DanmuX 是一个平台无关的弹幕数据标准参考实现，当前仓库定义并实现标准 v1。它把平台原始弹幕归一化为 `Base + Effects + Source`，并将 DanDanPlay 保留为兼容输出，而不是内部核心模型。

当前实现包含双层版本、Base 校验、`gradient`（`texture` / `linear`）、B 站原生渐变适配、普通弹幕人工渐变、DanDanPlay fallback、Enhanced Extension、未知效果隔离、聚合幂等、Asset Resolver 安全边界、能力协商、结构化诊断和测试。v0.2 起吸收 [`xlmc/danmu_api`](https://github.com/xlmc/danmu_api) 的接口经验，兼容四字段 JSON 与 Bilibili 8/9 字段 XML，并直接接受 protobuf parser 的 `progress/mode/fontsize/color_v2` 字段。项目仍处于早期参考实现阶段；格式兼容不代表已被下游部署或广泛采用。

播放器接入、具体渲染技术、BAS/mode 8/mode 9、动态渐变和其他平台原生高级特效不在 v1 范围内。

## 快速开始

要求 Node.js 18+，项目无运行时依赖。建议实际部署使用仍受 Node.js 官方支持的版本；18/20 保留为兼容性测试目标。从源码运行：

```bash
git clone https://github.com/xlmc/danmux.git
cd danmux
npm run check
npm run example
npm run check:package
npm run demo
```

以上命令不需要 API 密钥，也不需要安装依赖。`check:package` 会在临时目录验证打包后的安装与导出，不会发布 npm 包。其他项目可用 `npm install github:xlmc/danmux#v0.3.1` 安装已标记版本；GitHub 发布记录见 [Releases](https://github.com/xlmc/danmux/releases)。

运行 `npm run demo` 后打开 `http://127.0.0.1:4173`，可以编辑原始 Bilibili JSON 和自定义渐变 stops，直观看到弹幕效果、DanmuX 模型、兼容 `p/m` 和诊断结果。调试台直接加载仓库当前源码，不包含任何内置预设。

```js
import {
  createDanmuX,
  fromBilibili,
  applyGradient,
  toCompatibilityWire,
} from 'danmux';

const ordinary = createDanmuX({
  id: 't-1',
  time: 12.5,
  text: 'hello',
  mode: 'scroll',
  fontSize: 25,
  color: 0xffffff,
  source: { platform: 'tencent', id: 't-1' },
});

const enhanced = applyGradient(ordinary.value, {
  angle: 0,
  stops: [
    { position: 0, color: '#FB7299', alpha: 0.85 },
    { position: 1, color: '#33B8FF', alpha: 0.85 },
  ],
}).value;
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

普通弹幕不输出 `effects`。`Base.color` 始终是降级基准；不支持 Enhanced 的客户端只读取 `p+m`，仍显示单色弹幕。读取器仅解释 `extensionVersion=1` 的增强层；缺失或未知版本会生成诊断并保留 Base。

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

`fromBilibili()` 会把 B 站 `color_v2` / `colorfulSrc` 的填充或描边纹理映射为 `origin=native` 的 gradient，并把 protobuf 的毫秒 `progress`、数字 mode 和 `fontsize` 规范化到 Base；格式异常时保留 Base，并生成 namespaced `vendor=bilibili` fallback。`applyGradient()` 只接受调用方明确提供的 `angle` 与 `stops`，生成 `origin=generated` 的 linear gradient，不内置颜色规则；原生效果优先于同 target 的 generated 效果。

`aggregate()` 按 `source.platform + source.id + id` 去重，并在冲突时保留 native gradient。Transformer 是纯函数、可重复执行的；generated effect 不会覆盖 native effect。

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
  transformers/gradient-transformer.js  caller-defined linear gradient
  pipeline/aggregate.js          去重、合并、native 优先
  assets/resolver.js             资源协议、MIME、大小、超时和 hash 安全
  capabilities.js                Level 0/1 细粒度能力协商
schema/                          JSON Schema
types/                            TypeScript 类型定义
fixtures/                         golden 输入样例
test/                              单元、转换、安全和回归测试
```

## Conformance 状态

本仓库是可运行的早期参考实现，包含适配、降级、资源安全和版本隔离测试，不替代真实平台采集器、播放器或生产级图片解码器。CI 在 Linux / Windows 与 Node.js 18、20、22、24 上验证测试、示例和打包安装。实际通过状态以 [Actions](https://github.com/xlmc/danmux/actions) 为准。

下一步是带来源说明的匿名 fixture、下游客户端矩阵、属性/模糊测试与真实项目接入，验收条件见 [ROADMAP.md](ROADMAP.md)。当前示例数据不能作为真实部署或用户规模的证据。

## License

MIT

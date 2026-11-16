<div align="center">
  <a href="https://klinecharts.com">
    <img src="https://github.com/liihuu/KLineChart/assets/10508024/c55f301a-e0a2-422c-a9d5-fd960de68ba3"/>
  </a>
</div>
<h1 align="center">KLineChart</h1>

<div align="center">
English | <a href="https://github.com/liihuu/KLineChart/blob/main/README.zh-CN.md">简体中文</a>
</div>
<br/>

<p align="center">💹📈 Lightweight k-line chart built with html5 canvas.</p>
<div align="center">

[![GitHub Workflow Status (with branch)](https://img.shields.io/github/actions/workflow/status/liihuu/KLineChart/build.yml?logo=github)](https://github.com/liihuu/KLineChart/actions/workflows/build.yml)
[![Version](https://badgen.net/npm/v/klinecharts)](https://www.npmjs.com/package/klinecharts)
[![Size](https://badgen.net/bundlephobia/minzip/klinecharts@latest)](https://bundlephobia.com/result?p=klinecharts@latest)
[![npms.io (maintenance)](https://img.shields.io/npms-io/quality-score/klinecharts)](https://www.npmjs.com/package/klinecharts)
[![Typescript](https://badgen.net/npm/types/klinecharts)](types/index.d.ts)
[![LICENSE](https://badgen.net/github/license/liihuu/KLineChart)](LICENSE)
[![Docs](https://badgen.net/badge/docs%20by/vitepress/bd34fe)](https://vitepress.dev/)

</div>

<div align="center">

[![Issues](https://img.shields.io/static/v1?color=1f2328&logo=github&logoColor=fff&label&message=Github%20Issues)](https://github.com/liihuu/KLineChart/issues)
[![Discussions](https://img.shields.io/static/v1?color=1f2328&logo=github&logoColor=fff&label&message=Github%20Discussions)](https://github.com/liihuu/KLineChart/discussions)
[![Telegram](https://img.shields.io/static/v1?color=1296DB&logo=telegram&logoColor=fff&label&message=Telegram)](https://t.me/klinecharts)
[![Wechat](https://img.shields.io/static/v1?color=1EBE1F&logo=wechat&logoColor=fff&label&message=Wechat)](https://klinecharts.com/en-US/guide/feedback.html)
<!-- [![Discord](https://img.shields.io/static/v1?color=738BD8&logo=discord&logoColor=fff&label&message=Discord)](https://discord.gg/7YjHYgvvvZ) -->
<!-- [![Twitter](https://img.shields.io/static/v1?color=1D9BF0&logo=twitter&logoColor=fff&label&message=Twitter)](https://twitter.com/klinecharts) -->


</div>

<img style="margin-bottom:6px" src="https://cdn.nlark.com/yuque/0/2023/png/8403091/1684399506365-assets/web-upload/044fe897-168c-4fbb-a485-87a8ef61c04a.png" />


## ✨ Features
- 📦 **Out of the box:** Simple and fast integration, basically zero cost to get started.
- 🚀 **Lightweight and smooth:** Zero dependencies, only 40k under gzip compression.
- 💪 **Powerful functions:** Built-in multiple indicators and line drawing models.
- 🎨 **Highly scalable:** With rich style configuration and API, the function can be extended as you like.
- 📱 **Mobile:** Support mobile, one chart, handle multiple terminals.
- 🛡 **Typescript development:** Provide complete type definition files.

## ⚡ Performance
Similar to chart libraries for performance comparison. 
+ **Test Scenario:** 50000 pieces of data, 5 pane indicators, average 10 runs
+ **Device:** macOS Ventura, Apple M2 Pro, 16G
+ **Browser:** Chrome 114.0.5735.106
+ **Framework:** React@18.2.0

Comparison of time consumption from initialization to full rendering:

| **klinecharts@9.4.0** | **night-vision@0.3.2** | **hqchart@1.1.12147** |
| :---: | :---: | :---: |
|  37ms  |  36ms | 241ms | 


## 📦 Install
### Using npm
```bash
npm install klinecharts --save
```

### Using yarn
```bash
yarn add klinecharts
```

### CDNs
#### [unpkg](https://unpkg.com)
```html
<script type="text/javascript" src="https://unpkg.com/klinecharts/dist/klinecharts.min.js"></script>
```

#### [jsDelivr](https://cdn.jsdelivr.net)
```html
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/klinecharts/dist/klinecharts.min.js"></script>
```

## 📄 Docs
### Online
[https://www.klinecharts.com](https://www.klinecharts.com)

### Locale
Execute command in root directory. [Node.js](https://nodejs.org) is required.
```bash
# Install the dependencies
npm install

# Start document service
npm run docs:dev
```
After successful startup, open in the browser http://localhost:8888 .

## 🛠️ Build
Execute command in root directory. [Node.js](https://nodejs.org) is required.
```bash
# Install the dependencies
npm install

# Build files
npm run build
```
The generated files are in the dist folder.

## 🔗 Links
+ [Online Preview](https://preview.klinecharts.com)
+ [KLineChart Pro](https://pro.klinecharts.com)
+ [Sample Code](https://github.com/liihuu/KLineChartSample)

## ©️ License
KLineChart is available under the Apache License V2.

## Ratiofolio patches

Patches on `v9-stable` for the Ratiofolio chart. They are style-driven: unset keys keep the upstream picture. No app imports, no persistence, and no `window` access except the existing Playwright hitbox mirror.

### `ec1a9389` — Reveal indicator legend action icons on row hover

`TooltipStore` tracks the hovered legend row. `IndicatorTooltipView` draws configured tooltip icons only for that row, and always on a coarse pointer. `IndicatorWidget` clears the hover when the pointer leaves the pane.

### `51a83f32` — Collapsible candle legend tree with canvas hitboxes

Candle-pane indicator rows sit under an `Indicators (N)` root (`__ratiofolio_legend_tree__`). The expanded flag is session-only (`isCandleLegendExpanded`). Hitboxes of kind `tree_root`, `gear`, and `remove` are mirrored to `window.__RATIOFOLIO_LEGEND_HITBOXES__` only while `window.__RATIOFOLIO_CHART_TEST__` is set. Icon clicks use a rect hit surface registered before later row-hover rects. `Event` keeps `crosshair.paneId` while a legend icon is active so a follow-cross tooltip stays mounted for the click.

### Legend action bar, per-pane collapse, hidden rows, and visible-series range

Style keys (typed on both `candle.tooltip` and `indicator.tooltip` unless noted):

| Key | Role |
| :--- | :--- |
| `candle.visible` | Default true. `false` skips main candle, area, high/low, and last-price drawing, and leaves main OHLC out of `YAxis.calcRange`. |
| `tooltip.actionBar` | `{ backgroundColor, borderColor, borderSize, borderRadius, paddingX, gap }`. Painted behind a hovered row's values and action icons when the fill or border is visible. Default fill and border are `transparent`. |
| `tooltip.iconTooltip` | `{ backgroundColor, color, size, paddingX, paddingY, borderRadius }`. Bubble above a hovered control. |
| `tooltip.hiddenTextColor` | Name color when the series is hidden. Values are omitted. |
| `tooltip.collapse` | `{ show, iconColor, pillBorderColor }`. `show: false` (default) keeps the candle-pane `Indicators (N)` tree. `show: true` replaces that tree with a per-pane chevron; a collapsed pane is an outlined pill with a down chevron and the row count. State is a session `Set` of pane ids. |
| `tooltip.nameTooltip` | Optional string. The name hit emits `onTooltipIconClick` with `iconId: '__legend_name__'`. |
| `TooltipIconStyle.tooltip` | Optional hover label for that icon. |
| `TooltipIconStyle.persistent` | Optional. The icon stays visible when the row is not hovered. |

`YAxis.calcRange` skips indicators with `visible === false`. `overrideIndicator` rebuilds that range when the override changes visibility without recalculating the series.

`Indicators (N)` counts indicators whose tooltip data has a name or at least one value. An empty `createTooltipDataSource` (no name, no values) does not add a row and is not counted.

Hitbox `kind` adds `eye`, `more`, `name`, `collapse`, and `pill`. Every hitbox includes `paneId` and `indicatorName`. The main candle row uses `indicatorName: '__main__'`.

Icon ids for hitbox kinds: `ratiofolio_indicator_settings` (gear), `ratiofolio_indicator_remove` (remove), `ratiofolio_indicator_visibility` (eye), `ratiofolio_indicator_more` (more). Icons stay app-supplied. `icon` values `eye`, `eye-off`, `gear`, `trash`, and `more` are drawn as outline paths. Any other string is still drawn as text, so existing gear and remove glyphs keep working. The collapse chevron is an outline path.

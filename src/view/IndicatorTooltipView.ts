/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Nullable from '../common/Nullable'
import type KLineData from '../common/KLineData'
import type Crosshair from '../common/Crosshair'
import { type IndicatorStyle, type TooltipStyle, type TooltipIconStyle, type TooltipTextStyle, type TooltipLegend, type TooltipIconTooltipStyle, type TooltipActionBarStyle, TooltipShowRule, type TooltipLegendChild, TooltipIconPosition, PolygonType, LineType } from '../common/Styles'
import { ActionType } from '../common/Action'
import { formatPrecision, formatThousands, formatFoldDecimal } from '../common/utils/format'
import { isValid, isObject, isString, isNumber } from '../common/utils/typeChecks'
import { isTransparent } from '../common/utils/color'
import { createFont } from '../common/utils/canvas'
import type Coordinate from '../common/Coordinate'

import { type CustomApi } from '../Options'

import type YAxis from '../component/YAxis'

import { type Indicator, type IndicatorFigure, type IndicatorFigureStyle, type IndicatorTooltipData } from '../component/Indicator'
import type IndicatorImp from '../component/Indicator'
import { eachFigures } from '../component/Indicator'

import { type TooltipIcon, type LegendHitbox, LEGEND_NAME_ICON_ID } from '../store/TooltipStore'
import { PaneIdConstants } from '../pane/types'

import View from './View'
import { legendOutlineFigures, legendOutlineName, type LegendOutlineName } from './legendOutlineIcons'

/** Ratiofolio patch: reserved candle-pane legend tree identity (mirrors app constants). */
const LEGEND_TREE_ROOT_NAME = '__ratiofolio_legend_tree__'
const LEGEND_TREE_TOGGLE_ICON_ID = 'ratiofolio_legend_tree_toggle'
const LEGEND_GEAR_ICON_ID = 'ratiofolio_indicator_settings'
const LEGEND_REMOVE_ICON_ID = 'ratiofolio_indicator_remove'
const LEGEND_EYE_ICON_ID = 'ratiofolio_indicator_visibility'
const LEGEND_MORE_ICON_ID = 'ratiofolio_indicator_more'
const LEGEND_TREE_CHILD_INDENT_PX = 14

export function isCoarsePointerDevice (): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches
}

function isCandlePaneLegendParent (indicator: IndicatorImp): boolean {
  return indicator.name !== 'candle_indicator'
}

function centerLegendControlY (rowTop: number, rowHeight: number, controlHeight: number): number {
  if (!(rowHeight > 0) || !(controlHeight > 0)) {
    return rowTop
  }
  return rowTop + Math.max(0, (rowHeight - controlHeight) / 2)
}

export default class IndicatorTooltipView extends View<YAxis> {
  private readonly _boundIconClickEvent = (currentIcon: TooltipIcon) => () => {
    const pane = this.getWidget().getPane()
    pane.getChart().getChartStore().getActionStore().execute(ActionType.OnTooltipIconClick, { ...currentIcon })
    return true
  }

  private readonly _boundIconMouseMoveEvent = (currentIconInfo: TooltipIcon) => () => {
    const pane = this.getWidget().getPane()
    const tooltipStore = pane.getChart().getChartStore().getTooltipStore()
    tooltipStore.setActiveIcon({ ...currentIconInfo })
    // Keep the parent legend row revealed while hovering its action icons.
    tooltipStore.setHoveredLegend({
      paneId: currentIconInfo.paneId,
      indicatorName: currentIconInfo.indicatorName
    })
    return true
  }

  private readonly _boundLegendRowMouseMoveEvent = (paneId: string, indicatorName: string) => () => {
    const pane = this.getWidget().getPane()
    pane.getChart().getChartStore().getTooltipStore().setHoveredLegend({ paneId, indicatorName })
    // Keep traversing hit targets so an icon under the row hover surface can
    // activate its pointer state and cursor.
    return false
  }

  private readonly _boundTreeToggleClickEvent = () => () => {
    const pane = this.getWidget().getPane()
    pane.getChart().getChartStore().getTooltipStore().toggleCandleLegendExpanded()
    return true
  }

  private readonly _boundTreeToggleMouseMoveEvent = () => () => {
    const pane = this.getWidget().getPane()
    const tooltipStore = pane.getChart().getChartStore().getTooltipStore()
    tooltipStore.setActiveIcon({
      paneId: PaneIdConstants.CANDLE,
      indicatorName: LEGEND_TREE_ROOT_NAME,
      iconId: LEGEND_TREE_TOGGLE_ICON_ID
    })
    tooltipStore.setHoveredLegend({
      paneId: PaneIdConstants.CANDLE,
      indicatorName: LEGEND_TREE_ROOT_NAME
    })
    return true
  }

  private readonly _boundPaneCollapseClick = (paneId: string) => () => {
    const pane = this.getWidget().getPane()
    pane.getChart().getChartStore().getTooltipStore().togglePaneCollapsed(paneId)
    return true
  }

  private readonly _boundPaneCollapseMove = (paneId: string, indicatorName: string, iconId: string) => () => {
    const pane = this.getWidget().getPane()
    const tooltipStore = pane.getChart().getChartStore().getTooltipStore()
    tooltipStore.setActiveIcon({ paneId, indicatorName, iconId })
    return true
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const crosshair = chartStore.getTooltipStore().getCrosshair()
    chartStore.getTooltipStore().clearLegendHitboxes(pane.getId())
    if (isValid(crosshair.kLineData)) {
      const bounding = widget.getBounding()
      const customApi = chartStore.getCustomApi()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      const decimalFoldThreshold = chartStore.getDecimalFoldThreshold()
      const indicators = chartStore.getIndicatorStore().getInstances(pane.getId())
      const activeIcon = chartStore.getTooltipStore().getActiveIcon()
      const defaultStyles = chartStore.getStyles().indicator
      const { offsetLeft, offsetTop, offsetRight } = defaultStyles.tooltip
      this.drawIndicatorTooltip(
        ctx, pane.getId(), chartStore.getDataList(),
        crosshair, activeIcon, indicators, customApi,
        thousandsSeparator, decimalFoldThreshold,
        offsetLeft, offsetTop,
        bounding.width - offsetRight, defaultStyles
      )
    }
  }

  protected drawIndicatorTooltip (
    ctx: CanvasRenderingContext2D,
    paneId: string,
    dataList: KLineData[],
    crosshair: Crosshair,
    activeTooltipIcon: Nullable<TooltipIcon>,
    indicators: IndicatorImp[],
    customApi: CustomApi,
    thousandsSeparator: string,
    decimalFoldThreshold: number,
    left: number,
    top: number,
    maxWidth: number,
    styles: IndicatorStyle
  ): number {
    const tooltipStyles = styles.tooltip
    if (this.isDrawTooltip(crosshair, tooltipStyles)) {
      const tooltipTextStyles = tooltipStyles.text
      const tooltipStore = this.getWidget().getPane().getChart().getChartStore().getTooltipStore()
      const hoveredLegend = tooltipStore.getHoveredLegend()
      const coarsePointer = isCoarsePointerDevice()
      const isCandlePane = paneId === PaneIdConstants.CANDLE
      const groupCollapse = tooltipStyles.collapse.show

      const legendRows = indicators.filter(isCandlePaneLegendParent).flatMap(indicator => {
        const data = this.getIndicatorTooltipData(dataList, crosshair, indicator, customApi, thousandsSeparator, decimalFoldThreshold, styles)
        if (!this.tooltipDataRendersLegendRow(data)) {
          return []
        }
        return [{ indicator, data }]
      })
      if (groupCollapse && legendRows.length > 0 && tooltipStore.isPaneCollapsed(paneId)) {
        return this.drawCollapsePill(
          ctx, tooltipStore, paneId, legendRows.length, left, top, tooltipTextStyles, tooltipStyles.collapse
        )
      }

      let rowLeft = left
      if (!groupCollapse && isCandlePane && legendRows.length > 0) {
        top = this.drawCandleLegendTreeRoot(
          ctx,
          tooltipStore,
          activeTooltipIcon,
          legendRows.length,
          left,
          top,
          maxWidth,
          tooltipTextStyles
        )
        rowLeft = left + LEGEND_TREE_CHILD_INDENT_PX
        if (!tooltipStore.isCandleLegendExpanded()) {
          return top
        }
      }

      legendRows.forEach(({ indicator, data }) => {
        let prevRowHeight = 0
        const rowTop = top
        const coordinate = { x: rowLeft, y: top }
        const { name, calcParamsText, values: legends, icons } = data
        const nameValid = name.length > 0
        const legendValid = legends.length > 0
        const rowHovered =
          hoveredLegend?.paneId === paneId &&
          hoveredLegend?.indicatorName === indicator.name
        const rowFocused =
          activeTooltipIcon?.paneId === paneId &&
          activeTooltipIcon?.indicatorName === indicator.name
        // Ratiofolio patch: reveal configured tooltip icons only for the hovered/focused
        // legend row (always on coarse-pointer / touch devices). Persistent icons stay.
        const revealIcons = coarsePointer || rowHovered || rowFocused
        const visibleIcons = revealIcons ? icons : icons.filter(icon => icon.persistent === true)
        const [leftIcons, middleIcons, rightIcons] = this.classifyTooltipIcons(visibleIcons)
        const nameColor = indicator.visible ? tooltipTextStyles.color : tooltipStyles.hiddenTextColor
        const iconOptions = {
          iconTooltip: tooltipStyles.iconTooltip,
          textFamily: tooltipTextStyles.family,
          gap: this.actionBarPaints(tooltipStyles.actionBar) && revealIcons ? tooltipStyles.actionBar.gap : undefined
        }
        prevRowHeight = this.drawStandardTooltipIcons(
          ctx, activeTooltipIcon, leftIcons,
          coordinate, paneId, indicator.name,
          rowLeft, prevRowHeight, maxWidth, iconOptions
        )

        let nameHit: { x: number, width: number } | null = null
        if (nameValid) {
          let text = name
          if (calcParamsText.length > 0) {
            text = `${text}${calcParamsText}`
          }
          const nameStartX = coordinate.x
          prevRowHeight = this.drawStandardTooltipLegends(
            ctx,
            [
              {
                title: { text: '', color: nameColor },
                value: { text, color: nameColor }
              }
            ],
            coordinate, rowLeft, prevRowHeight, maxWidth, tooltipTextStyles
          )
          nameHit = { x: nameStartX, width: Math.max(1, coordinate.x - nameStartX) }
        }

        prevRowHeight = this.drawStandardTooltipIcons(
          ctx, activeTooltipIcon, middleIcons,
          coordinate, paneId, indicator.name,
          rowLeft, prevRowHeight, maxWidth, iconOptions
        )

        const clusterStartX = coordinate.x
        const clusterStartY = coordinate.y
        if (revealIcons && this.actionBarPaints(tooltipStyles.actionBar) && (legendValid || rightIcons.length > 0)) {
          const clusterWidth = this.measureTooltipLegendsWidth(ctx, legendValid ? legends : [], tooltipTextStyles) +
            this.measureTooltipIconsWidth(ctx, rightIcons, iconOptions.gap)
          this.drawActionBar(
            ctx,
            clusterStartX,
            clusterStartY,
            clusterWidth,
            Math.max(prevRowHeight, tooltipTextStyles.marginTop + tooltipTextStyles.size + tooltipTextStyles.marginBottom),
            tooltipStyles.actionBar
          )
        }

        if (legendValid) {
          prevRowHeight = this.drawStandardTooltipLegends(
            ctx, legends, coordinate,
            rowLeft, prevRowHeight, maxWidth, tooltipStyles.text
          )
        }

        prevRowHeight = this.drawStandardTooltipIcons(
          ctx, activeTooltipIcon, rightIcons,
          coordinate, paneId, indicator.name,
          rowLeft, prevRowHeight, maxWidth, iconOptions
        )

        const rowBottom = coordinate.y + prevRowHeight
        const rowHeight = Math.max(1, rowBottom - rowTop)
        if (!groupCollapse && isCandlePane) {
          // Subtle tree guide under the root caret column.
          this.createFigure({
            name: 'rect',
            attrs: {
              x: left + 5,
              y: rowTop,
              width: 1,
              height: rowHeight
            },
            styles: {
              style: 'fill',
              color: 'rgba(118, 128, 143, 0.35)',
              borderColor: 'rgba(0,0,0,0)',
              borderSize: 0,
              borderStyle: 'solid',
              borderDashedValue: [2, 2]
            }
          })?.draw(ctx)
        }
        if (nameHit !== null) {
          this.drawLegendNameHit(
            ctx, tooltipStore, paneId, indicator.name,
            nameHit.x, rowTop, nameHit.width, rowHeight,
            tooltipStyles.nameTooltip, tooltipStyles.iconTooltip, tooltipTextStyles.family
          )
        }
        // Invisible hitbox so hovering the legend text reveals action icons.
        // Added after the name hit so reverse dispatch reaches icons and the name first.
        this.createFigure({
          name: 'rect',
          attrs: {
            x: rowLeft,
            y: rowTop,
            width: Math.max(1, maxWidth - rowLeft),
            height: rowHeight
          },
          styles: {
            style: 'fill',
            color: 'rgba(0,0,0,0)',
            borderColor: 'rgba(0,0,0,0)',
            borderSize: 0,
            borderStyle: 'solid',
            borderDashedValue: [2, 2]
          }
        }, {
          mouseMoveEvent: this._boundLegendRowMouseMoveEvent(paneId, indicator.name)
        })?.draw(ctx)

        top = rowBottom
      })

      if (groupCollapse && legendRows.length > 0) {
        top = this.drawCollapseChevron(
          ctx, tooltipStore, paneId, left, top, tooltipStyles.collapse.iconColor
        )
      }
    }
    return top
  }

  private drawCandleLegendTreeRoot (
    ctx: CanvasRenderingContext2D,
    tooltipStore: {
      isCandleLegendExpanded: () => boolean
      addLegendHitbox: (hitbox: LegendHitbox) => void
    },
    activeTooltipIcon: Nullable<TooltipIcon>,
    parentCount: number,
    left: number,
    top: number,
    maxWidth: number,
    tooltipTextStyles: TooltipTextStyle
  ): number {
    const expanded = tooltipStore.isCandleLegendExpanded()
    const caret = expanded ? '▼' : '▶'
    const label = `${caret} Indicators (${parentCount})`
    const { marginLeft, marginTop, marginRight, marginBottom, size, family, weight, color } = tooltipTextStyles
    ctx.font = createFont(size, weight, family)
    const textWidth = ctx.measureText(label).width
    const rowHeight = marginTop + size + marginBottom
    const active =
      activeTooltipIcon?.paneId === PaneIdConstants.CANDLE &&
      activeTooltipIcon?.indicatorName === LEGEND_TREE_ROOT_NAME &&
      activeTooltipIcon?.iconId === LEGEND_TREE_TOGGLE_ICON_ID
    const textX = left + marginLeft
    const textY = top + marginTop
    const hitWidth = Math.max(1, Math.min(maxWidth - left, textWidth + marginLeft + marginRight + 16))
    const hitHeight = rowHeight
    // Hit surface first so reverse-order event dispatch finds the tree toggle before
    // later parent-row hover rects that may share vertical space during redraw races.
    this.createFigure({
      name: 'rect',
      attrs: {
        x: left,
        y: top,
        width: hitWidth,
        height: hitHeight
      },
      styles: {
        style: 'fill',
        color: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderSize: 0,
        borderStyle: 'solid',
        borderDashedValue: [2, 2]
      }
    }, {
      mouseClickEvent: this._boundTreeToggleClickEvent(),
      mouseMoveEvent: this._boundTreeToggleMouseMoveEvent()
    })?.draw(ctx)

    this.createFigure({
      name: 'text',
      attrs: { text: label, x: textX, y: textY },
      styles: {
        color: active ? '#1677FF' : color,
        size,
        family,
        weight
      }
    })?.draw(ctx)

    tooltipStore.addLegendHitbox({
      kind: 'tree_root',
      paneId: PaneIdConstants.CANDLE,
      indicatorName: LEGEND_TREE_ROOT_NAME,
      x: left,
      y: top,
      width: hitWidth,
      height: hitHeight
    })

    return top + rowHeight + 2
  }

  protected drawStandardTooltipIcons (
    ctx: CanvasRenderingContext2D,
    activeIcon: Nullable<TooltipIcon>,
    icons: TooltipIconStyle[],
    coordinate: Coordinate,
    paneId: string,
    indicatorName: string,
    left: number,
    prevRowHeight: number,
    maxWidth: number,
    options?: {
      iconTooltip?: TooltipIconTooltipStyle
      textFamily?: string
      gap?: number
    }
  ): number {
    if (icons.length > 0) {
      const tooltipStore = this.getWidget().getPane().getChart().getChartStore().getTooltipStore()
      let width = 0
      let height = 0
      const iconGap = options?.gap
      icons.forEach(icon => {
        const {
          marginLeft = 0, marginTop = 0, marginRight = 0, marginBottom = 0,
          paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0,
          size, fontFamily, icon: text
        } = icon
        ctx.font = createFont(size, 'normal', fontFamily)
        const contentWidth = paddingLeft + ctx.measureText(legendOutlineName(text) !== null ? '' : text).width + paddingRight
        const hitWidth = Math.max(24, legendOutlineName(text) !== null ? size + paddingLeft + paddingRight : contentWidth)
        if (iconGap !== undefined) {
          width += hitWidth + iconGap
        } else {
          width += (marginLeft + paddingLeft + ctx.measureText(text).width + paddingRight + marginRight)
        }
        height = Math.max(height, marginTop + paddingTop + size + paddingBottom + marginBottom)
      })
      if (coordinate.x + width > maxWidth) {
        coordinate.x = left
        coordinate.y += prevRowHeight
        prevRowHeight = height
      } else {
        prevRowHeight = Math.max(prevRowHeight, height)
      }
      icons.forEach(icon => {
        const {
          marginLeft = 0, marginRight = 0,
          paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0,
          color, activeColor, size, fontFamily, icon: text,
          backgroundColor, activeBackgroundColor
        } = icon
        const active = activeIcon?.paneId === paneId && activeIcon?.indicatorName === indicatorName && activeIcon?.iconId === icon.id
        const controlHeight = paddingTop + size + paddingBottom
        ctx.font = createFont(size, 'normal', fontFamily)
        const outline = legendOutlineName(text)
        const textWidth = outline !== null ? size : ctx.measureText(text).width
        // Emoji glyph metrics disagree between measureText and figure text hit-testing.
        // Use a deterministic rect hit surface (same approach as the candle legend tree root).
        const contentWidth = paddingLeft + textWidth + paddingRight
        const hitWidth = Math.max(24, contentWidth)
        const hitHeight = Math.max(24, controlHeight)
        const iconGap = options?.gap
        const iconY = centerLegendControlY(coordinate.y, prevRowHeight, hitHeight)
        const iconX = coordinate.x + (iconGap !== undefined ? 0 : marginLeft)
        const textDrawX = iconX + Math.max(0, (hitWidth - contentWidth) / 2)
        const textDrawY = iconY + Math.max(0, (hitHeight - controlHeight) / 2)
        const ink = active ? activeColor : color

        if (active && !isTransparent(activeBackgroundColor)) {
          this.createFigure({
            name: 'rect',
            attrs: { x: iconX, y: iconY, width: hitWidth, height: hitHeight },
            styles: {
              style: PolygonType.Fill,
              color: activeBackgroundColor,
              borderColor: 'transparent',
              borderSize: 0,
              borderRadius: 4,
              borderStyle: LineType.Solid,
              borderDashedValue: [2, 2]
            }
          })?.draw(ctx)
        }

        if (outline !== null) {
          this.drawOutlineIcon(ctx, outline, iconX + (hitWidth - size) / 2, iconY + (hitHeight - size) / 2, size, ink)
        } else {
          // App-supplied glyph. Hit testing stays on the rect below.
          this.createFigure({
            name: 'text',
            attrs: { text, x: textDrawX, y: textDrawY },
            styles: {
              paddingLeft,
              paddingTop,
              paddingRight,
              paddingBottom,
              color: ink,
              size,
              family: fontFamily,
              backgroundColor: active ? 'transparent' : backgroundColor
            }
          })?.draw(ctx)
        }

        // Hit surface after the glyph so reverse dispatch finds the button before later row hovers.
        this.createFigure({
          name: 'rect',
          attrs: {
            x: iconX,
            y: iconY,
            width: hitWidth,
            height: hitHeight
          },
          styles: {
            style: 'fill',
            color: 'rgba(0,0,0,0)',
            borderColor: 'rgba(0,0,0,0)',
            borderSize: 0,
            borderStyle: 'solid',
            borderDashedValue: [2, 2]
          }
        }, {
          mouseClickEvent: this._boundIconClickEvent({ paneId, indicatorName, iconId: icon.id }),
          mouseMoveEvent: this._boundIconMouseMoveEvent({ paneId, indicatorName, iconId: icon.id })
        })?.draw(ctx)

        const hitKind = this.legendIconHitboxKind(icon.id)
        if (hitKind !== null) {
          tooltipStore.addLegendHitbox({
            kind: hitKind,
            paneId,
            indicatorName,
            x: iconX,
            y: iconY,
            width: hitWidth,
            height: hitHeight
          })
        }

        if (active && isString(icon.tooltip) && icon.tooltip.length > 0 && options?.iconTooltip !== undefined) {
          this.drawIconTooltipBubble(
            ctx, icon.tooltip, iconX, iconY, hitWidth, options.iconTooltip, options.textFamily ?? fontFamily
          )
        }

        coordinate.x += iconGap !== undefined ? hitWidth + iconGap : (marginLeft + hitWidth + marginRight)
      })
    }
    return prevRowHeight
  }

  protected drawStandardTooltipLegends (
    ctx: CanvasRenderingContext2D,
    legends: TooltipLegend[],
    coordinate: Coordinate,
    left: number,
    prevRowHeight: number,
    maxWidth: number,
    styles: TooltipTextStyle
  ): number {
    if (legends.length > 0) {
      const { marginLeft, marginTop, marginRight, marginBottom, size, family, weight } = styles
      ctx.font = createFont(size, weight, family)
      legends.forEach(data => {
        const title = data.title as TooltipLegendChild
        const value = data.value as TooltipLegendChild
        const titleTextWidth = ctx.measureText(title.text).width
        const valueTextWidth = ctx.measureText(value.text).width
        const totalTextWidth = titleTextWidth + valueTextWidth
        const h = marginTop + size + marginBottom
        if (coordinate.x + marginLeft + totalTextWidth + marginRight > maxWidth) {
          coordinate.x = left
          coordinate.y += prevRowHeight
          prevRowHeight = h
        } else {
          prevRowHeight = Math.max(prevRowHeight, h)
        }
        if (title.text.length > 0) {
          this.createFigure({
            name: 'text',
            attrs: { x: coordinate.x + marginLeft, y: coordinate.y + marginTop, text: title.text },
            styles: { color: title.color, size, family, weight }
          })?.draw(ctx)
        }
        this.createFigure({
          name: 'text',
          attrs: { x: coordinate.x + marginLeft + titleTextWidth, y: coordinate.y + marginTop, text: value.text },
          styles: { color: value.color, size, family, weight }
        })?.draw(ctx)
        coordinate.x += (marginLeft + totalTextWidth + marginRight)
      })
    }
    return prevRowHeight
  }

  protected isDrawTooltip (crosshair: Crosshair, styles: TooltipStyle): boolean {
    const tooltipStore = this.getWidget().getPane().getChart().getChartStore().getTooltipStore()
    // Keep pane-local legends mounted while interacting with gear/remove/tree controls.
    // Upstream mouseMove clears crosshair.paneId when an icon is active, which would
    // otherwise unmount FollowCross tooltips before mouseClickEvent can fire.
    if (tooltipStore.getHoveredLegend() !== null || tooltipStore.getActiveIcon() !== null) {
      return true
    }
    const showRule = styles.showRule
    return showRule === TooltipShowRule.Always ||
      (showRule === TooltipShowRule.FollowCross && isString(crosshair.paneId))
  }

  protected getIndicatorTooltipData (
    dataList: KLineData[],
    crosshair: Crosshair,
    indicator: Indicator,
    customApi: CustomApi,
    thousandsSeparator: string,
    decimalFoldThreshold: number,
    styles: IndicatorStyle
  ): IndicatorTooltipData {
    const tooltipStyles = styles.tooltip
    const name = tooltipStyles.showName ? indicator.shortName : ''
    let calcParamsText = ''
    const calcParams = indicator.calcParams
    if (calcParams.length > 0 && tooltipStyles.showParams) {
      calcParamsText = `(${calcParams.join(',')})`
    }

    const tooltipData: IndicatorTooltipData = { name, calcParamsText, values: [], icons: tooltipStyles.icons }

    const dataIndex = crosshair.dataIndex!
    const result = indicator.result ?? []

    const legends: TooltipLegend[] = []
    if (indicator.visible) {
      const indicatorData = result[dataIndex] ?? {}
      eachFigures(dataList, indicator, dataIndex, styles, (figure: IndicatorFigure, figureStyles: Required<IndicatorFigureStyle>) => {
        if (isString(figure.title)) {
          const color = figureStyles.color
          let value = indicatorData[figure.key] ?? tooltipStyles.defaultValue
          if (isNumber(value)) {
            value = formatPrecision(value, indicator.precision)
            if (indicator.shouldFormatBigNumber) {
              value = customApi.formatBigNumber(value as string)
            }
            value = formatFoldDecimal(formatThousands(value as string, thousandsSeparator), decimalFoldThreshold)
          }
          legends.push({ title: { text: figure.title, color }, value: { text: value, color } })
        }
      })
      tooltipData.values = legends
    }

    if (indicator.createTooltipDataSource !== null) {
      const widget = this.getWidget()
      const pane = widget.getPane()
      const chartStore = pane.getChart().getChartStore()
      const { name: customName, calcParamsText: customCalcParamsText, values: customLegends, icons: customIcons } = indicator.createTooltipDataSource({
        kLineDataList: dataList,
        indicator,
        visibleRange: chartStore.getTimeScaleStore().getVisibleRange(),
        bounding: widget.getBounding(),
        crosshair,
        defaultStyles: styles,
        xAxis: pane.getChart().getXAxisPane().getAxisComponent(),
        yAxis: pane.getAxisComponent()
      })
      if (isString(customName) && tooltipStyles.showName) {
        tooltipData.name = customName
      }
      if (isString(customCalcParamsText) && tooltipStyles.showParams) {
        tooltipData.calcParamsText = customCalcParamsText
      }
      if (isValid(customIcons)) {
        tooltipData.icons = customIcons
      }
      if (isValid(customLegends) && indicator.visible) {
        const optimizedLegends: TooltipLegend[] = []
        const color = styles.tooltip.text.color
        customLegends.forEach(data => {
          let title = { text: '', color }
          if (isObject(data.title)) {
            title = data.title
          } else {
            title.text = data.title
          }
          let value = { text: '', color }
          if (isObject(data.value)) {
            value = data.value
          } else {
            value.text = data.value ?? tooltipStyles.defaultValue
          }
          if (isNumber(value.text)) {
            let text = formatPrecision(value.text, indicator.precision)
            if (indicator.shouldFormatBigNumber) {
              text = customApi.formatBigNumber(text)
            }
            text = formatFoldDecimal(formatThousands(text, thousandsSeparator), decimalFoldThreshold)
            value.text = text
          }
          optimizedLegends.push({ title, value })
        })
        tooltipData.values = optimizedLegends
      }
    }
    return tooltipData
  }

  protected classifyTooltipIcons (icons: TooltipIconStyle[]): TooltipIconStyle[][] {
    const leftIcons: TooltipIconStyle[] = []
    const middleIcons: TooltipIconStyle[] = []
    const rightIcons: TooltipIconStyle[] = []
    icons.forEach(icon => {
      switch (icon.position) {
        case TooltipIconPosition.Left: {
          leftIcons.push(icon)
          break
        }
        case TooltipIconPosition.Middle: {
          middleIcons.push(icon)
          break
        }
        case TooltipIconPosition.Right: {
          rightIcons.push(icon)
          break
        }
      }
    })
    return [leftIcons, middleIcons, rightIcons]
  }

  /** A legend row exists when the tooltip has a name or at least one value. */
  private tooltipDataRendersLegendRow (data: { name: string, values: TooltipLegend[] }): boolean {
    return data.name.length > 0 || data.values.length > 0
  }

  protected actionBarPaints (bar: TooltipActionBarStyle): boolean {
    const fill = !isTransparent(bar.backgroundColor)
    const stroke = bar.borderSize > 0 && !isTransparent(bar.borderColor)
    return fill || stroke
  }

  private legendIconHitboxKind (iconId: string): LegendHitbox['kind'] | null {
    switch (iconId) {
      case LEGEND_GEAR_ICON_ID: {
        return 'gear'
      }
      case LEGEND_REMOVE_ICON_ID: {
        return 'remove'
      }
      case LEGEND_EYE_ICON_ID: {
        return 'eye'
      }
      case LEGEND_MORE_ICON_ID: {
        return 'more'
      }
      default: {
        return null
      }
    }
  }

  protected measureTooltipLegendsWidth (
    ctx: CanvasRenderingContext2D,
    legends: TooltipLegend[],
    styles: TooltipTextStyle
  ): number {
    if (legends.length === 0) {
      return 0
    }
    const { marginLeft, marginRight, size, family, weight } = styles
    ctx.font = createFont(size, weight, family)
    let width = 0
    legends.forEach(data => {
      const title = data.title as TooltipLegendChild
      const value = data.value as TooltipLegendChild
      width += marginLeft + ctx.measureText(title.text).width + ctx.measureText(value.text).width + marginRight
    })
    return width
  }

  protected measureTooltipIconsWidth (
    ctx: CanvasRenderingContext2D,
    icons: TooltipIconStyle[],
    gap?: number
  ): number {
    if (icons.length === 0) {
      return 0
    }
    let width = 0
    icons.forEach(icon => {
      const paddingLeft = icon.paddingLeft
      const paddingRight = icon.paddingRight
      const outline = legendOutlineName(icon.icon)
      ctx.font = createFont(icon.size, 'normal', icon.fontFamily)
      const glyph = outline !== null ? icon.size : ctx.measureText(icon.icon).width
      const hitWidth = Math.max(24, paddingLeft + glyph + paddingRight)
      if (gap !== undefined) {
        width += hitWidth + gap
      } else {
        width += icon.marginLeft + hitWidth + icon.marginRight
      }
    })
    return width
  }

  protected drawActionBar (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    bar: TooltipActionBarStyle
  ): void {
    if (width <= 0 || height <= 0 || !this.actionBarPaints(bar)) {
      return
    }
    const fill = !isTransparent(bar.backgroundColor)
    const stroke = bar.borderSize > 0 && !isTransparent(bar.borderColor)
    this.createFigure({
      name: 'rect',
      attrs: {
        x: x - bar.paddingX,
        y,
        width: width + bar.paddingX * 2,
        height
      },
      styles: {
        style: fill && stroke ? PolygonType.StrokeFill : (stroke ? PolygonType.Stroke : PolygonType.Fill),
        color: bar.backgroundColor,
        borderColor: bar.borderColor,
        borderSize: bar.borderSize,
        borderRadius: bar.borderRadius,
        borderStyle: LineType.Solid,
        borderDashedValue: [2, 2]
      }
    })?.draw(ctx)
  }

  private drawOutlineIcon (
    ctx: CanvasRenderingContext2D,
    icon: LegendOutlineName,
    x: number,
    y: number,
    size: number,
    color: string
  ): void {
    legendOutlineFigures(icon, x, y, size).forEach(figure => {
      if (figure.name === 'line') {
        this.createFigure({
          name: 'line',
          attrs: { coordinates: figure.coordinates },
          styles: { color, size: 1.25, style: LineType.Solid }
        })?.draw(ctx)
        return
      }
      if (figure.name === 'circle') {
        this.createFigure({
          name: 'circle',
          attrs: { x: figure.x, y: figure.y, r: figure.r },
          styles: {
            style: PolygonType.Stroke,
            color: 'transparent',
            borderColor: color,
            borderSize: 1.25,
            borderStyle: LineType.Solid,
            borderDashedValue: [2, 2]
          }
        })?.draw(ctx)
        return
      }
      this.createFigure({
        name: 'polygon',
        attrs: { coordinates: figure.coordinates },
        styles: {
          style: PolygonType.Stroke,
          color: 'transparent',
          borderColor: color,
          borderSize: 1.25,
          borderStyle: LineType.Solid,
          borderDashedValue: [2, 2]
        }
      })?.draw(ctx)
    })
  }

  protected drawIconTooltipBubble (
    ctx: CanvasRenderingContext2D,
    text: string,
    anchorX: number,
    anchorY: number,
    anchorWidth: number,
    styles: TooltipIconTooltipStyle,
    family: string
  ): void {
    ctx.font = createFont(styles.size, 'normal', family)
    const textWidth = ctx.measureText(text).width
    const boxWidth = textWidth + styles.paddingX * 2
    const boxHeight = styles.size + styles.paddingY * 2
    const x = anchorX + anchorWidth / 2 - boxWidth / 2
    const y = anchorY - boxHeight - 4
    this.createFigure({
      name: 'rect',
      attrs: { x, y, width: boxWidth, height: boxHeight },
      styles: {
        style: PolygonType.Fill,
        color: styles.backgroundColor,
        borderColor: 'transparent',
        borderSize: 0,
        borderRadius: styles.borderRadius,
        borderStyle: LineType.Solid,
        borderDashedValue: [2, 2]
      }
    })?.draw(ctx)
    this.createFigure({
      name: 'text',
      attrs: { x: x + styles.paddingX, y: y + styles.paddingY, text },
      styles: { color: styles.color, size: styles.size, family, weight: 'normal' }
    })?.draw(ctx)
  }

  private drawLegendNameHit (
    ctx: CanvasRenderingContext2D,
    tooltipStore: { addLegendHitbox: (hitbox: LegendHitbox) => void, getActiveIcon: () => Nullable<TooltipIcon> },
    paneId: string,
    indicatorName: string,
    x: number,
    y: number,
    width: number,
    height: number,
    nameTooltip: string | undefined,
    iconTooltip: TooltipIconTooltipStyle,
    family: string
  ): void {
    this.createFigure({
      name: 'rect',
      attrs: { x, y, width, height },
      styles: {
        style: PolygonType.Fill,
        color: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderSize: 0,
        borderStyle: LineType.Solid,
        borderDashedValue: [2, 2]
      }
    }, {
      mouseClickEvent: this._boundIconClickEvent({ paneId, indicatorName, iconId: LEGEND_NAME_ICON_ID }),
      mouseMoveEvent: this._boundIconMouseMoveEvent({ paneId, indicatorName, iconId: LEGEND_NAME_ICON_ID })
    })?.draw(ctx)
    tooltipStore.addLegendHitbox({
      kind: 'name',
      paneId,
      indicatorName,
      x,
      y,
      width,
      height
    })
    const active = tooltipStore.getActiveIcon()
    if (
      active?.paneId === paneId &&
      active?.indicatorName === indicatorName &&
      active?.iconId === LEGEND_NAME_ICON_ID &&
      isString(nameTooltip) &&
      nameTooltip.length > 0
    ) {
      this.drawIconTooltipBubble(ctx, nameTooltip, x, y, width, iconTooltip, family)
    }
  }

  private drawCollapseChevron (
    ctx: CanvasRenderingContext2D,
    tooltipStore: { addLegendHitbox: (hitbox: LegendHitbox) => void },
    paneId: string,
    left: number,
    top: number,
    iconColor: string
  ): number {
    const size = 14
    const hitWidth = 24
    const hitHeight = 20
    this.createFigure({
      name: 'rect',
      attrs: { x: left, y: top, width: hitWidth, height: hitHeight },
      styles: {
        style: PolygonType.Fill,
        color: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderSize: 0,
        borderStyle: LineType.Solid,
        borderDashedValue: [2, 2]
      }
    }, {
      mouseClickEvent: this._boundPaneCollapseClick(paneId),
      mouseMoveEvent: this._boundPaneCollapseMove(paneId, LEGEND_TREE_ROOT_NAME, 'collapse')
    })?.draw(ctx)
    this.drawOutlineIcon(ctx, 'chevron-up', left + (hitWidth - size) / 2, top + (hitHeight - size) / 2, size, iconColor)
    tooltipStore.addLegendHitbox({
      kind: 'collapse',
      paneId,
      indicatorName: LEGEND_TREE_ROOT_NAME,
      x: left,
      y: top,
      width: hitWidth,
      height: hitHeight
    })
    return top + hitHeight
  }

  private drawCollapsePill (
    ctx: CanvasRenderingContext2D,
    tooltipStore: { addLegendHitbox: (hitbox: LegendHitbox) => void },
    paneId: string,
    count: number,
    left: number,
    top: number,
    textStyles: TooltipTextStyle,
    collapse: { iconColor: string, pillBorderColor: string }
  ): number {
    const label = String(count)
    ctx.font = createFont(textStyles.size, textStyles.weight, textStyles.family)
    const textWidth = ctx.measureText(label).width
    const iconSize = 12
    const paddingX = 8
    const gap = 4
    const height = Math.max(22, textStyles.size + 8)
    const width = paddingX + iconSize + gap + textWidth + paddingX
    const radius = height / 2
    this.createFigure({
      name: 'rect',
      attrs: { x: left, y: top, width, height },
      styles: {
        style: PolygonType.Stroke,
        color: 'transparent',
        borderColor: collapse.pillBorderColor,
        borderSize: 1,
        borderRadius: radius,
        borderStyle: LineType.Solid,
        borderDashedValue: [2, 2]
      }
    }, {
      mouseClickEvent: this._boundPaneCollapseClick(paneId),
      mouseMoveEvent: this._boundPaneCollapseMove(paneId, LEGEND_TREE_ROOT_NAME, 'pill')
    })?.draw(ctx)
    this.drawOutlineIcon(
      ctx,
      'chevron-down',
      left + paddingX,
      top + (height - iconSize) / 2,
      iconSize,
      collapse.iconColor
    )
    this.createFigure({
      name: 'text',
      attrs: {
        x: left + paddingX + iconSize + gap,
        y: top + (height - textStyles.size) / 2,
        text: label
      },
      styles: {
        color: textStyles.color,
        size: textStyles.size,
        family: textStyles.family,
        weight: textStyles.weight
      }
    })?.draw(ctx)
    tooltipStore.addLegendHitbox({
      kind: 'pill',
      paneId,
      indicatorName: LEGEND_TREE_ROOT_NAME,
      x: left,
      y: top,
      width,
      height
    })
    return top + height + 2
  }
}

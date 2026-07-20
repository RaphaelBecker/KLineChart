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
import { type IndicatorStyle, type TooltipStyle, type TooltipIconStyle, type TooltipTextStyle, type TooltipLegend, TooltipShowRule, type TooltipLegendChild, TooltipIconPosition } from '../common/Styles'
import { ActionType } from '../common/Action'
import { formatPrecision, formatThousands, formatFoldDecimal } from '../common/utils/format'
import { isValid, isObject, isString, isNumber } from '../common/utils/typeChecks'
import { createFont } from '../common/utils/canvas'
import type Coordinate from '../common/Coordinate'

import { type CustomApi } from '../Options'

import type YAxis from '../component/YAxis'

import { type Indicator, type IndicatorFigure, type IndicatorFigureStyle, type IndicatorTooltipData } from '../component/Indicator'
import type IndicatorImp from '../component/Indicator'
import { eachFigures } from '../component/Indicator'

import { type TooltipIcon } from '../store/TooltipStore'
import { PaneIdConstants } from '../pane/types'

import View from './View'

/** Ratiofolio patch: reserved candle-pane legend tree identity (mirrors app constants). */
const LEGEND_TREE_ROOT_NAME = '__ratiofolio_legend_tree__'
const LEGEND_TREE_TOGGLE_ICON_ID = 'ratiofolio_legend_tree_toggle'
const LEGEND_GEAR_ICON_ID = 'ratiofolio_indicator_settings'
const LEGEND_REMOVE_ICON_ID = 'ratiofolio_indicator_remove'
const LEGEND_TREE_CHILD_INDENT_PX = 14

function isCoarsePointerDevice (): boolean {
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

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const crosshair = chartStore.getTooltipStore().getCrosshair()
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
      if (isCandlePane) {
        tooltipStore.clearLegendHitboxes()
      }

      const parentIndicators = indicators.filter(isCandlePaneLegendParent)
      let rowLeft = left
      if (isCandlePane && parentIndicators.length > 0) {
        top = this.drawCandleLegendTreeRoot(
          ctx,
          tooltipStore,
          activeTooltipIcon,
          parentIndicators.length,
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

      parentIndicators.forEach(indicator => {
        let prevRowHeight = 0
        const rowTop = top
        const coordinate = { x: rowLeft, y: top }
        const { name, calcParamsText, values: legends, icons } = this.getIndicatorTooltipData(dataList, crosshair, indicator, customApi, thousandsSeparator, decimalFoldThreshold, styles)
        const nameValid = name.length > 0
        const legendValid = legends.length > 0
        if (nameValid || legendValid) {
          const rowHovered =
            hoveredLegend?.paneId === paneId &&
            hoveredLegend?.indicatorName === indicator.name
          const rowFocused =
            activeTooltipIcon?.paneId === paneId &&
            activeTooltipIcon?.indicatorName === indicator.name
          // Ratiofolio patch: reveal configured tooltip icons only for the hovered/focused
          // legend row (always on coarse-pointer / touch devices).
          const revealIcons = coarsePointer || rowHovered || rowFocused
          const visibleIcons = revealIcons ? icons : []
          const [leftIcons, middleIcons, rightIcons] = this.classifyTooltipIcons(visibleIcons)
          prevRowHeight = this.drawStandardTooltipIcons(
            ctx, activeTooltipIcon, leftIcons,
            coordinate, paneId, indicator.name,
            rowLeft, prevRowHeight, maxWidth
          )

          if (nameValid) {
            let text = name
            if (calcParamsText.length > 0) {
              text = `${text}${calcParamsText}`
            }
            prevRowHeight = this.drawStandardTooltipLegends(
              ctx,
              [
                {
                  title: { text: '', color: tooltipTextStyles.color },
                  value: { text, color: tooltipTextStyles.color }
                }
              ],
              coordinate, rowLeft, prevRowHeight, maxWidth, tooltipTextStyles
            )
          }

          prevRowHeight = this.drawStandardTooltipIcons(
            ctx, activeTooltipIcon, middleIcons,
            coordinate, paneId, indicator.name,
            rowLeft, prevRowHeight, maxWidth
          )

          if (legendValid) {
            prevRowHeight = this.drawStandardTooltipLegends(
              ctx, legends, coordinate,
              rowLeft, prevRowHeight, maxWidth, tooltipStyles.text
            )
          }

          // draw right icons
          prevRowHeight = this.drawStandardTooltipIcons(
            ctx, activeTooltipIcon, rightIcons,
            coordinate, paneId, indicator.name,
            rowLeft, prevRowHeight, maxWidth
          )

          const rowBottom = coordinate.y + prevRowHeight
          const rowHeight = Math.max(1, rowBottom - rowTop)
          if (isCandlePane) {
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
          // Invisible hitbox so hovering the legend text reveals action icons.
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
        }
      })
    }
    return top
  }

  private drawCandleLegendTreeRoot (
    ctx: CanvasRenderingContext2D,
    tooltipStore: {
      isCandleLegendExpanded: () => boolean
      addLegendHitbox: (hitbox: {
        kind: 'tree_root' | 'gear' | 'remove'
        paneId: string
        indicatorName?: string
        x: number
        y: number
        width: number
        height: number
      }) => void
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
    maxWidth: number
  ): number {
    if (icons.length > 0) {
      const tooltipStore = this.getWidget().getPane().getChart().getChartStore().getTooltipStore()
      let width = 0
      let height = 0
      icons.forEach(icon => {
        const {
          marginLeft = 0, marginTop = 0, marginRight = 0, marginBottom = 0,
          paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0,
          size, fontFamily, icon: text
        } = icon
        ctx.font = createFont(size, 'normal', fontFamily)
        width += (marginLeft + paddingLeft + ctx.measureText(text).width + paddingRight + marginRight)
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
        const textWidth = ctx.measureText(text).width
        // Emoji glyph metrics disagree between measureText and figure text hit-testing.
        // Use a deterministic rect hit surface (same approach as the candle legend tree root).
        const contentWidth = paddingLeft + textWidth + paddingRight
        const hitWidth = Math.max(24, contentWidth)
        const hitHeight = Math.max(24, controlHeight)
        const iconY = centerLegendControlY(coordinate.y, prevRowHeight, hitHeight)
        const iconX = coordinate.x + marginLeft
        const textDrawX = iconX + Math.max(0, (hitWidth - contentWidth) / 2)
        const textDrawY = iconY + Math.max(0, (hitHeight - controlHeight) / 2)

        // Visual glyph only — not registered for events (avoids emoji hit-test drift).
        this.createFigure({
          name: 'text',
          attrs: { text, x: textDrawX, y: textDrawY },
          styles: {
            paddingLeft,
            paddingTop,
            paddingRight,
            paddingBottom,
            color: active ? activeColor : color,
            size,
            family: fontFamily,
            backgroundColor: active ? activeBackgroundColor : backgroundColor
          }
        })?.draw(ctx)

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

        if (icon.id === LEGEND_GEAR_ICON_ID || icon.id === LEGEND_REMOVE_ICON_ID) {
          tooltipStore.addLegendHitbox({
            kind: icon.id === LEGEND_GEAR_ICON_ID ? 'gear' : 'remove',
            paneId,
            indicatorName,
            x: iconX,
            y: iconY,
            width: hitWidth,
            height: hitHeight
          })
        }

        coordinate.x += (marginLeft + hitWidth + marginRight)
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
}

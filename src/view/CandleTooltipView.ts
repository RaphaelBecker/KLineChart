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
import type Bounding from '../common/Bounding'
import type KLineData from '../common/KLineData'
import type Precision from '../common/Precision'
import type Crosshair from '../common/Crosshair'
import {
  type Styles, type CandleStyle, type TooltipLegend, type TooltipLegendChild, TooltipShowType, CandleTooltipRectPosition,
  type CandleTooltipCustomCallbackData, YAxisPosition, PolygonType
} from '../common/Styles'
import { ActionType } from '../common/Action'
import { formatPrecision, formatThousands, formatFoldDecimal } from '../common/utils/format'
import { createFont } from '../common/utils/canvas'
import { isFunction, isObject, isString, isValid } from '../common/utils/typeChecks'

import { type CustomApi, FormatDateType } from '../Options'

import { PaneIdConstants } from '../pane/types'

import type Indicator from '../component/Indicator'

import IndicatorTooltipView, { isCoarsePointerDevice } from './IndicatorTooltipView'

import { type TooltipIcon, LEGEND_NAME_ICON_ID, MAIN_LEGEND_INDICATOR_NAME } from '../store/TooltipStore'

import { i18n } from '../extension/i18n/index'

export default class CandleTooltipView extends IndicatorTooltipView {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const paneId = pane.getId()
    const chartStore = pane.getChart().getChartStore()
    const crosshair = chartStore.getTooltipStore().getCrosshair()
    if (isValid(crosshair.kLineData)) {
      const bounding = widget.getBounding()
      const yAxisBounding = pane.getYAxisWidget()!.getBounding()
      const dataList = chartStore.getDataList()
      const precision = chartStore.getPrecision()
      const locale = chartStore.getLocale()
      const customApi = chartStore.getCustomApi()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      const decimalFoldThreshold = chartStore.getDecimalFoldThreshold()
      const activeIcon = chartStore.getTooltipStore().getActiveIcon()
      const indicators = chartStore.getIndicatorStore().getInstances(pane.getId())
      const dateTimeFormat = chartStore.getTimeScaleStore().getDateTimeFormat()
    const styles = chartStore.getStyles()
    chartStore.getTooltipStore().clearLegendHitboxes(paneId)
    const candleStyles = styles.candle
      const indicatorStyles = styles.indicator
      if (
        candleStyles.tooltip.showType === TooltipShowType.Rect &&
        indicatorStyles.tooltip.showType === TooltipShowType.Rect
      ) {
        const isDrawCandleTooltip = this.isDrawTooltip(crosshair, candleStyles.tooltip)
        const isDrawIndicatorTooltip = this.isDrawTooltip(crosshair, indicatorStyles.tooltip)
        this._drawRectTooltip(
          ctx, dataList, indicators,
          bounding, yAxisBounding,
          crosshair, precision,
          dateTimeFormat, locale, customApi, thousandsSeparator, decimalFoldThreshold,
          isDrawCandleTooltip, isDrawIndicatorTooltip,
          candleStyles.tooltip.offsetTop, styles
        )
      } else if (
        candleStyles.tooltip.showType === TooltipShowType.Standard &&
        indicatorStyles.tooltip.showType === TooltipShowType.Standard
      ) {
        const { offsetLeft, offsetTop, offsetRight } = candleStyles.tooltip
        const maxWidth = bounding.width - offsetRight
        const top = this._drawCandleStandardTooltip(
          ctx, dataList, paneId, crosshair, activeIcon, precision,
          dateTimeFormat, locale, customApi, thousandsSeparator, decimalFoldThreshold,
          offsetLeft, offsetTop, maxWidth, candleStyles
        )
        this.drawIndicatorTooltip(
          ctx, paneId, dataList, crosshair,
          activeIcon, indicators, customApi,
          thousandsSeparator, decimalFoldThreshold,
          offsetLeft, top, maxWidth, indicatorStyles
        )
      } else if (
        candleStyles.tooltip.showType === TooltipShowType.Rect &&
        indicatorStyles.tooltip.showType === TooltipShowType.Standard
      ) {
        const { offsetLeft, offsetTop, offsetRight } = candleStyles.tooltip
        const maxWidth = bounding.width - offsetRight
        const top = this.drawIndicatorTooltip(
          ctx, paneId, dataList, crosshair,
          activeIcon, indicators, customApi,
          thousandsSeparator, decimalFoldThreshold,
          offsetLeft, offsetTop, maxWidth, indicatorStyles
        )
        const isDrawCandleTooltip = this.isDrawTooltip(crosshair, candleStyles.tooltip)
        this._drawRectTooltip(
          ctx, dataList, indicators,
          bounding, yAxisBounding,
          crosshair, precision, dateTimeFormat,
          locale, customApi, thousandsSeparator, decimalFoldThreshold,
          isDrawCandleTooltip, false, top, styles
        )
      } else {
        const { offsetLeft, offsetTop, offsetRight } = candleStyles.tooltip
        const maxWidth = bounding.width - offsetRight
        const top = this._drawCandleStandardTooltip(
          ctx, dataList, paneId, crosshair, activeIcon, precision,
          dateTimeFormat, locale, customApi, thousandsSeparator, decimalFoldThreshold,
          offsetLeft, offsetTop, maxWidth, candleStyles
        )
        const isDrawIndicatorTooltip = this.isDrawTooltip(crosshair, indicatorStyles.tooltip)
        this._drawRectTooltip(
          ctx, dataList, indicators,
          bounding, yAxisBounding,
          crosshair, precision, dateTimeFormat,
          locale, customApi, thousandsSeparator, decimalFoldThreshold,
          false, isDrawIndicatorTooltip, top, styles
        )
      }
    }
  }

  private _drawCandleStandardTooltip (
    ctx: CanvasRenderingContext2D,
    dataList: KLineData[],
    paneId: string,
    crosshair: Crosshair,
    activeTooltipIcon: Nullable<TooltipIcon>,
    precision: Precision,
    dateTimeFormat: Intl.DateTimeFormat,
    locale: string,
    customApi: CustomApi,
    thousandsSeparator: string,
    decimalFoldThreshold: number,
    left: number,
    top: number,
    maxWidth: number,
    styles: CandleStyle
  ): number {
    const tooltipStyles = styles.tooltip
    const tooltipTextStyles = tooltipStyles.text
    let prevRowHeight = 0
    const coordinate = { x: left, y: top }
    if (this.isDrawTooltip(crosshair, tooltipStyles)) {
      const dataIndex = crosshair.dataIndex ?? 0
      const legends = this._getCandleTooltipLegends(
        { prev: dataList[dataIndex - 1] ?? null, current: crosshair.kLineData!, next: dataList[dataIndex + 1] ?? null },
        precision, dateTimeFormat, locale, customApi, thousandsSeparator, decimalFoldThreshold, styles
      )
      const candleVisible = styles.visible !== false
      const nameLegends: TooltipLegend[] = []
      const valueLegends: TooltipLegend[] = []
      legends.forEach(legend => {
        const value = legend.value
        const valueText = isObject(value) ? value.text : value
        if (valueText.length === 0) {
          nameLegends.push(candleVisible ? legend : {
            title: { text: isObject(legend.title) ? legend.title.text : legend.title, color: tooltipStyles.hiddenTextColor },
            value: { text: '', color: tooltipStyles.hiddenTextColor }
          })
        } else if (candleVisible) {
          valueLegends.push(legend)
        }
      })

      const tooltipStore = this.getWidget().getPane().getChart().getChartStore().getTooltipStore()
      const hovered = tooltipStore.getHoveredLegend()
      const rowHovered = hovered?.paneId === paneId && hovered?.indicatorName === MAIN_LEGEND_INDICATOR_NAME
      const rowFocused = activeTooltipIcon?.paneId === paneId && activeTooltipIcon?.indicatorName === MAIN_LEGEND_INDICATOR_NAME
      const revealIcons = isCoarsePointerDevice() || rowHovered || rowFocused
      const visibleIcons = revealIcons ? tooltipStyles.icons : tooltipStyles.icons.filter(icon => icon.persistent === true)
      const [leftIcons, middleIcons, rightIcons] = this.classifyTooltipIcons(visibleIcons)
      const iconOptions = {
        iconTooltip: tooltipStyles.iconTooltip,
        textFamily: tooltipTextStyles.family,
        gap: undefined as number | undefined
      }
      const rowTop = top

      prevRowHeight = this.drawStandardTooltipIcons(
        ctx, activeTooltipIcon, leftIcons, coordinate,
        paneId, MAIN_LEGEND_INDICATOR_NAME, left, prevRowHeight, maxWidth, iconOptions
      )

      const nameStartX = coordinate.x
      if (nameLegends.length > 0) {
        prevRowHeight = this.drawStandardTooltipLegends(
          ctx, nameLegends, coordinate, left,
          prevRowHeight, maxWidth, tooltipTextStyles
        )
      }
      const nameWidth = coordinate.x - nameStartX

      prevRowHeight = this.drawStandardTooltipIcons(
        ctx, activeTooltipIcon, middleIcons, coordinate,
        paneId, MAIN_LEGEND_INDICATOR_NAME, left, prevRowHeight, maxWidth, iconOptions
      )

      const clusterX = coordinate.x
      const clusterY = coordinate.y
      if (
        revealIcons &&
        (valueLegends.length > 0 || rightIcons.length > 0) &&
        this.actionBarPaints(tooltipStyles.actionBar)
      ) {
        iconOptions.gap = tooltipStyles.actionBar.gap
        const clusterWidth = this.measureTooltipLegendsWidth(ctx, valueLegends, tooltipTextStyles) +
          this.measureTooltipIconsWidth(ctx, rightIcons, iconOptions.gap)
        this.drawActionBar(
          ctx,
          clusterX,
          clusterY,
          clusterWidth,
          Math.max(prevRowHeight, tooltipTextStyles.marginTop + tooltipTextStyles.size + tooltipTextStyles.marginBottom),
          tooltipStyles.actionBar
        )
      }

      if (valueLegends.length > 0) {
        prevRowHeight = this.drawStandardTooltipLegends(
          ctx, valueLegends, coordinate, left,
          prevRowHeight, maxWidth, tooltipTextStyles
        )
      }

      prevRowHeight = this.drawStandardTooltipIcons(
        ctx, activeTooltipIcon, rightIcons, coordinate,
        paneId, MAIN_LEGEND_INDICATOR_NAME, left, prevRowHeight, maxWidth, iconOptions
      )

      const rowHeight = Math.max(1, coordinate.y + prevRowHeight - rowTop)
      if (nameWidth > 0) {
        this.drawCandleNameHit(ctx, paneId, nameStartX, rowTop, nameWidth, rowHeight, tooltipStyles)
      }
      this.createFigure({
        name: 'rect',
        attrs: { x: left, y: rowTop, width: Math.max(1, maxWidth - left), height: rowHeight },
        styles: {
          style: 'fill',
          color: 'rgba(0,0,0,0)',
          borderColor: 'rgba(0,0,0,0)',
          borderSize: 0,
          borderStyle: 'solid',
          borderDashedValue: [2, 2]
        }
      }, {
        mouseMoveEvent: () => {
          this.getWidget().getPane().getChart().getChartStore().getTooltipStore().setHoveredLegend({
            paneId,
            indicatorName: MAIN_LEGEND_INDICATOR_NAME
          })
          return false
        }
      })?.draw(ctx)
    }
    return coordinate.y + prevRowHeight
  }

  private drawCandleNameHit (
    ctx: CanvasRenderingContext2D,
    paneId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    tooltipStyles: CandleStyle['tooltip']
  ): void {
    const tooltipStore = this.getWidget().getPane().getChart().getChartStore().getTooltipStore()
    this.createFigure({
      name: 'rect',
      attrs: { x, y, width, height },
      styles: {
        style: 'fill',
        color: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderSize: 0,
        borderStyle: 'solid',
        borderDashedValue: [2, 2]
      }
    }, {
      mouseClickEvent: () => {
        this.getWidget().getPane().getChart().getChartStore().getActionStore().execute(ActionType.OnTooltipIconClick, {
          paneId,
          indicatorName: MAIN_LEGEND_INDICATOR_NAME,
          iconId: LEGEND_NAME_ICON_ID
        })
        return true
      },
      mouseMoveEvent: () => {
        tooltipStore.setActiveIcon({ paneId, indicatorName: MAIN_LEGEND_INDICATOR_NAME, iconId: LEGEND_NAME_ICON_ID })
        tooltipStore.setHoveredLegend({ paneId, indicatorName: MAIN_LEGEND_INDICATOR_NAME })
        return false
      }
    })?.draw(ctx)
    tooltipStore.addLegendHitbox({
      kind: 'name',
      paneId,
      indicatorName: MAIN_LEGEND_INDICATOR_NAME,
      x,
      y,
      width,
      height
    })
    const active = tooltipStore.getActiveIcon()
    const label = tooltipStyles.nameTooltip
    if (
      active?.paneId === paneId &&
      active.indicatorName === MAIN_LEGEND_INDICATOR_NAME &&
      active.iconId === LEGEND_NAME_ICON_ID &&
      isString(label) &&
      label.length > 0
    ) {
      this.drawIconTooltipBubble(ctx, label, x, y, width, tooltipStyles.iconTooltip, tooltipStyles.text.family)
    }
  }

  private _drawRectTooltip (
    ctx: CanvasRenderingContext2D,
    dataList: KLineData[],
    indicators: Indicator[],
    bounding: Bounding,
    yAxisBounding: Bounding,
    crosshair: Crosshair,
    precision: Precision,
    dateTimeFormat: Intl.DateTimeFormat,
    locale: string,
    customApi: CustomApi,
    thousandsSeparator: string,
    decimalFoldThreshold: number,
    isDrawCandleTooltip: boolean,
    isDrawIndicatorTooltip: boolean,
    top: number,
    styles: Styles
  ): void {
    const candleStyles = styles.candle
    const indicatorStyles = styles.indicator
    const candleTooltipStyles = candleStyles.tooltip
    const indicatorTooltipStyles = indicatorStyles.tooltip
    if (isDrawCandleTooltip || isDrawIndicatorTooltip) {
      const dataIndex = crosshair.dataIndex ?? 0
      const candleLegends = this._getCandleTooltipLegends(
        { prev: dataList[dataIndex - 1] ?? null, current: crosshair.kLineData!, next: dataList[dataIndex + 1] ?? null },
        precision, dateTimeFormat, locale, customApi, thousandsSeparator, decimalFoldThreshold, candleStyles
      )

      const { offsetLeft, offsetTop, offsetRight, offsetBottom } = candleTooltipStyles

      const {
        marginLeft: baseTextMarginLeft,
        marginRight: baseTextMarginRight,
        marginTop: baseTextMarginTop,
        marginBottom: baseTextMarginBottom,
        size: baseTextSize,
        weight: baseTextWeight,
        family: baseTextFamily
      } = candleTooltipStyles.text

      const {
        position: rectPosition,
        paddingLeft: rectPaddingLeft,
        paddingRight: rectPaddingRight,
        paddingTop: rectPaddingTop,
        paddingBottom: rectPaddingBottom,
        offsetLeft: rectOffsetLeft,
        offsetRight: rectOffsetRight,
        offsetTop: rectOffsetTop,
        offsetBottom: rectOffsetBottom,
        borderSize: rectBorderSize,
        borderRadius: rectBorderRadius,
        borderColor: rectBorderColor,
        color: rectBackgroundColor
      } = candleTooltipStyles.rect

      let maxTextWidth = 0
      let rectWidth = 0
      let rectHeight = 0
      if (isDrawCandleTooltip) {
        ctx.font = createFont(baseTextSize, baseTextWeight, baseTextFamily)
        candleLegends.forEach(data => {
          const title = data.title as TooltipLegendChild
          const value = data.value as TooltipLegendChild
          const text = `${title.text}${value.text}`
          const labelWidth = ctx.measureText(text).width + baseTextMarginLeft + baseTextMarginRight
          maxTextWidth = Math.max(maxTextWidth, labelWidth)
        })
        rectHeight += ((baseTextMarginBottom + baseTextMarginTop + baseTextSize) * candleLegends.length)
      }

      const {
        marginLeft: indicatorTextMarginLeft,
        marginRight: indicatorTextMarginRight,
        marginTop: indicatorTextMarginTop,
        marginBottom: indicatorTextMarginBottom,
        size: indicatorTextSize,
        weight: indicatorTextWeight,
        family: indicatorTextFamily
      } = indicatorTooltipStyles.text
      const indicatorLegendsArray: TooltipLegend[][] = []
      if (isDrawIndicatorTooltip) {
        ctx.font = createFont(indicatorTextSize, indicatorTextWeight, indicatorTextFamily)
        indicators.forEach(indicator => {
          const tooltipDataValues = this.getIndicatorTooltipData(dataList, crosshair, indicator, customApi, thousandsSeparator, decimalFoldThreshold, indicatorStyles).values ?? []
          indicatorLegendsArray.push(tooltipDataValues)
          tooltipDataValues.forEach(data => {
            const title = data.title as TooltipLegendChild
            const value = data.value as TooltipLegendChild
            const text = `${title.text}${value.text}`
            const textWidth = ctx.measureText(text).width + indicatorTextMarginLeft + indicatorTextMarginRight
            maxTextWidth = Math.max(maxTextWidth, textWidth)
            rectHeight += (indicatorTextMarginTop + indicatorTextMarginBottom + indicatorTextSize)
          })
        })
      }
      rectWidth += maxTextWidth
      if (rectWidth !== 0 && rectHeight !== 0) {
        rectWidth += (rectBorderSize * 2 + rectPaddingLeft + rectPaddingRight)
        rectHeight += (rectBorderSize * 2 + rectPaddingTop + rectPaddingBottom)
        const centerX = bounding.width / 2
        const isPointer = rectPosition === CandleTooltipRectPosition.Pointer && crosshair.paneId === PaneIdConstants.CANDLE
        const isLeft = (crosshair.realX ?? 0) > centerX
        let rectX: number = 0
        if (isPointer) {
          const realX = crosshair.realX!
          if (isLeft) {
            rectX = realX - rectOffsetRight - rectWidth
          } else {
            rectX = realX + rectOffsetLeft
          }
        } else {
          if (isLeft) {
            rectX = rectOffsetLeft + offsetLeft
            if (styles.yAxis.inside && styles.yAxis.position === YAxisPosition.Left) {
              rectX += yAxisBounding.width
            }
          } else {
            rectX = bounding.width - rectOffsetRight - rectWidth - offsetRight
            if (styles.yAxis.inside && styles.yAxis.position === YAxisPosition.Right) {
              rectX -= yAxisBounding.width
            }
          }
        }

        let rectY = top + rectOffsetTop
        if (isPointer) {
          const y = crosshair.y!
          rectY = y - rectHeight / 2
          if (rectY + rectHeight > bounding.height - rectOffsetBottom - offsetBottom) {
            rectY = bounding.height - rectOffsetBottom - rectHeight - offsetBottom
          }
          if (rectY < top + rectOffsetTop) {
            rectY = top + rectOffsetTop + offsetTop
          }
        }
        this.createFigure({
          name: 'rect',
          attrs: {
            x: rectX,
            y: rectY,
            width: rectWidth,
            height: rectHeight
          },
          styles: {
            style: PolygonType.StrokeFill,
            color: rectBackgroundColor,
            borderColor: rectBorderColor,
            borderSize: rectBorderSize,
            borderRadius: rectBorderRadius
          }
        })?.draw(ctx)
        const candleTextX = rectX + rectBorderSize + rectPaddingLeft + baseTextMarginLeft
        let textY = rectY + rectBorderSize + rectPaddingTop
        if (isDrawCandleTooltip) {
          // render candle texts
          candleLegends.forEach(data => {
            textY += baseTextMarginTop
            const title = data.title as TooltipLegendChild
            this.createFigure({
              name: 'text',
              attrs: {
                x: candleTextX,
                y: textY,
                text: title.text
              },
              styles: {
                color: title.color,
                size: baseTextSize,
                family: baseTextFamily,
                weight: baseTextWeight
              }
            })?.draw(ctx)
            const value = data.value as TooltipLegendChild
            this.createFigure({
              name: 'text',
              attrs: {
                x: rectX + rectWidth - rectBorderSize - baseTextMarginRight - rectPaddingRight,
                y: textY,
                text: value.text,
                align: 'right'
              },
              styles: {
                color: value.color,
                size: baseTextSize,
                family: baseTextFamily,
                weight: baseTextWeight
              }
            })?.draw(ctx)
            textY += (baseTextSize + baseTextMarginBottom)
          })
        }
        if (isDrawIndicatorTooltip) {
          // render indicator texts
          const indicatorTextX = rectX + rectBorderSize + rectPaddingLeft + indicatorTextMarginLeft
          indicatorLegendsArray.forEach(legends => {
            legends.forEach(data => {
              textY += indicatorTextMarginTop
              const title = data.title as TooltipLegendChild
              const value = data.value as TooltipLegendChild
              this.createFigure({
                name: 'text',
                attrs: {
                  x: indicatorTextX,
                  y: textY,
                  text: title.text
                },
                styles: {
                  color: title.color,
                  size: indicatorTextSize,
                  family: indicatorTextFamily,
                  weight: indicatorTextWeight
                }
              })?.draw(ctx)

              this.createFigure({
                name: 'text',
                attrs: {
                  x: rectX + rectWidth - rectBorderSize - indicatorTextMarginRight - rectPaddingRight,
                  y: textY,
                  text: value.text,
                  align: 'right'
                },
                styles: {
                  color: value.color,
                  size: indicatorTextSize,
                  family: indicatorTextFamily,
                  weight: indicatorTextWeight
                }
              })?.draw(ctx)
              textY += (indicatorTextSize + indicatorTextMarginBottom)
            })
          })
        }
      }
    }
  }

  private _getCandleTooltipLegends (
    data: CandleTooltipCustomCallbackData,
    precision: Precision,
    dateTimeFormat: Intl.DateTimeFormat,
    locale: string,
    customApi: CustomApi,
    thousandsSeparator: string,
    decimalFoldThreshold: number,
    styles: CandleStyle
  ): TooltipLegend[] {
    const tooltipStyles = styles.tooltip
    const textColor = tooltipStyles.text.color
    const current = data.current
    const prevClose = data.prev?.close ?? current.close
    const changeValue = current.close - prevClose
    const { price: pricePrecision, volume: volumePrecision } = precision
    const mapping = {
      '{time}': customApi.formatDate(dateTimeFormat, current.timestamp, 'YYYY-MM-DD HH:mm', FormatDateType.Tooltip),
      '{open}': formatFoldDecimal(formatThousands(formatPrecision(current.open, pricePrecision), thousandsSeparator), decimalFoldThreshold),
      '{high}': formatFoldDecimal(formatThousands(formatPrecision(current.high, pricePrecision), thousandsSeparator), decimalFoldThreshold),
      '{low}': formatFoldDecimal(formatThousands(formatPrecision(current.low, pricePrecision), thousandsSeparator), decimalFoldThreshold),
      '{close}': formatFoldDecimal(formatThousands(formatPrecision(current.close, pricePrecision), thousandsSeparator), decimalFoldThreshold),
      '{volume}': formatFoldDecimal(formatThousands(
        customApi.formatBigNumber(formatPrecision(current.volume ?? tooltipStyles.defaultValue, volumePrecision)),
        thousandsSeparator
      ), decimalFoldThreshold),
      '{turnover}': formatFoldDecimal(formatThousands(
        formatPrecision(current.turnover ?? tooltipStyles.defaultValue, pricePrecision),
        thousandsSeparator
      ), decimalFoldThreshold),
      '{change}': prevClose === 0 ? tooltipStyles.defaultValue : `${formatThousands(formatPrecision(changeValue / prevClose * 100), thousandsSeparator)}%`
    }
    const legends = (
      isFunction(tooltipStyles.custom)
        ? tooltipStyles.custom(data, styles)
        : tooltipStyles.custom
    ) ?? []
    return legends.map(({ title, value }) => {
      let t: TooltipLegendChild = { text: '', color: '' }
      if (isObject(title)) {
        t = { ...title }
      } else {
        t.text = title
        t.color = textColor
      }
      t.text = i18n(t.text, locale)
      let v: TooltipLegendChild = { text: tooltipStyles.defaultValue, color: '' }
      if (isObject(value)) {
        v = { ...value }
      } else {
        v.text = value
        v.color = textColor
      }
      const match = v.text.match(/{(\S*)}/)
      if (match !== null && match.length > 1) {
        const key = `{${match[1]}}`
        v.text = v.text.replace(key, (mapping[key] ?? tooltipStyles.defaultValue) as string)
        if (key === '{change}') {
          v.color = changeValue === 0 ? styles.priceMark.last.noChangeColor : (changeValue > 0 ? styles.priceMark.last.upColor : styles.priceMark.last.downColor)
        }
      }
      return { title: t, value: v }
    })
  }
}

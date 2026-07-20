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
import { UpdateLevel } from '../common/Updater'
import { isNumber } from '../common/utils/typeChecks'

import type ChartStore from './ChartStore'

export interface TooltipIcon {
  paneId: string
  indicatorName: string
  iconId: string
}

export interface TooltipLegendHover {
  paneId: string
  indicatorName: string
}

/** Ratiofolio patch: deterministic legend geometry for Playwright real-canvas clicks. */
export interface LegendHitbox {
  kind: 'tree_root' | 'gear' | 'remove'
  paneId: string
  indicatorName?: string
  x: number
  y: number
  width: number
  height: number
}

export default class TooltipStore {
  private readonly _chartStore: ChartStore
  private _crosshair: Crosshair = {}
  private _activeIcon: Nullable<TooltipIcon> = null
  /** Ratiofolio patch: which indicator legend row is hovered/focused for action icons. */
  private _hoveredLegend: Nullable<TooltipLegendHover> = null
  /** Ratiofolio patch: candle-pane parent-legend tree expanded state (session-only). */
  private _candleLegendExpanded = true
  private _legendHitboxes: LegendHitbox[] = []

  constructor (chartStore: ChartStore) {
    this._chartStore = chartStore
  }

  /**
    * 设置十字光标点信息
    * @param crosshair
    * @param options
    */
  setCrosshair (crosshair?: Crosshair, options?: { notInvalidate?: boolean, notExecuteAction?: boolean }): void {
    const { notInvalidate, notExecuteAction } = options ?? {}
    const dataList = this._chartStore.getDataList()
    const cr = crosshair ?? {}
    let realDataIndex: number
    let dataIndex: number
    if (isNumber(cr.x)) {
      realDataIndex = this._chartStore.getTimeScaleStore().coordinateToDataIndex(cr.x)
      if (realDataIndex < 0) {
        dataIndex = 0
      } else if (realDataIndex > dataList.length - 1) {
        dataIndex = dataList.length - 1
      } else {
        dataIndex = realDataIndex
      }
    } else {
      realDataIndex = dataList.length - 1
      dataIndex = realDataIndex
    }
    const kLineData: Nullable<KLineData> = dataList[dataIndex]
    const realX = this._chartStore.getTimeScaleStore().dataIndexToCoordinate(realDataIndex)
    const prevCrosshair = { x: this._crosshair.x, y: this._crosshair.y, paneId: this._crosshair.paneId }
    this._crosshair = { ...cr, realX, kLineData, realDataIndex, dataIndex }
    if (
      prevCrosshair.x !== cr.x || prevCrosshair.y !== cr.y || prevCrosshair.paneId !== cr.paneId
    ) {
      if (kLineData !== null && !(notExecuteAction ?? false)) {
        this._chartStore.getChart().crosshairChange(this._crosshair)
      }
      if (!(notInvalidate ?? false)) {
        this._chartStore.getChart().updatePane(UpdateLevel.Overlay)
      }
    }
  }

  /**
   * 重新计算十字光标
   * @param notInvalidate
   */
  recalculateCrosshair (notInvalidate: boolean): void {
    this.setCrosshair(this._crosshair, { notInvalidate })
  }

  /**
   * 获取crosshair信息
   * @returns
   */
  getCrosshair (): Crosshair {
    return this._crosshair
  }

  setActiveIcon (icon?: TooltipIcon): void {
    this._activeIcon = icon ?? null
  }

  getActiveIcon (): Nullable<TooltipIcon> {
    return this._activeIcon
  }

  setHoveredLegend (legend?: TooltipLegendHover): void {
    const next = legend ?? null
    const prev = this._hoveredLegend
    const changed =
      (prev?.paneId !== next?.paneId) ||
      (prev?.indicatorName !== next?.indicatorName)
    this._hoveredLegend = next
    if (changed) {
      this._chartStore.getChart().updatePane(UpdateLevel.Overlay)
    }
  }

  getHoveredLegend (): Nullable<TooltipLegendHover> {
    return this._hoveredLegend
  }

  isCandleLegendExpanded (): boolean {
    return this._candleLegendExpanded
  }

  setCandleLegendExpanded (expanded: boolean): void {
    if (this._candleLegendExpanded === expanded) {
      return
    }
    this._candleLegendExpanded = expanded
    this._chartStore.getChart().updatePane(UpdateLevel.Overlay)
  }

  toggleCandleLegendExpanded (): void {
    this.setCandleLegendExpanded(!this._candleLegendExpanded)
  }

  clearLegendHitboxes (): void {
    this._legendHitboxes = []
    this._syncLegendHitboxesToWindow()
  }

  addLegendHitbox (hitbox: LegendHitbox): void {
    this._legendHitboxes.push(hitbox)
    this._syncLegendHitboxesToWindow()
  }

  getLegendHitboxes (): LegendHitbox[] {
    return this._legendHitboxes.slice()
  }

  private _syncLegendHitboxesToWindow (): void {
    if (typeof window === 'undefined') {
      return
    }
    // Only expose geometry when the Playwright chart test hook is registered.
    const w = window as Window & {
      __RATIOFOLIO_CHART_TEST__?: unknown
      __RATIOFOLIO_LEGEND_HITBOXES__?: LegendHitbox[]
    }
    if (!w.__RATIOFOLIO_CHART_TEST__) {
      delete w.__RATIOFOLIO_LEGEND_HITBOXES__
      return
    }
    w.__RATIOFOLIO_LEGEND_HITBOXES__ = this._legendHitboxes.slice()
  }

  clear (): void {
    this.setCrosshair({}, { notInvalidate: true })
    this.setActiveIcon()
    this.setHoveredLegend()
  }
}

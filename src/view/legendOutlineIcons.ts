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

import type Coordinate from '../common/Coordinate'

export type LegendOutlineName =
  'eye' | 'eye-off' | 'gear' | 'trash' | 'more' | 'chevron-down' | 'chevron-up'

export function legendOutlineName (icon: string): LegendOutlineName | null {
  switch (icon) {
    case 'eye':
    case 'eye-off':
    case 'gear':
    case 'trash':
    case 'more':
    case 'chevron-down':
    case 'chevron-up': {
      return icon
    }
    default: {
      return null
    }
  }
}

export interface LegendOutlineLine {
  name: 'line'
  coordinates: Coordinate[]
}

export interface LegendOutlineCircle {
  name: 'circle'
  x: number
  y: number
  r: number
}

export interface LegendOutlinePolygon {
  name: 'polygon'
  coordinates: Coordinate[]
}

export type LegendOutlineFigure = LegendOutlineLine | LegendOutlineCircle | LegendOutlinePolygon

function point (x: number, y: number): Coordinate {
  return { x, y }
}

function ellipse (cx: number, cy: number, rx: number, ry: number, steps: number): Coordinate[] {
  const coordinates: Coordinate[] = []
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps
    coordinates.push(point(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry))
  }
  return coordinates
}

/**
 * Outline figures inside the box (x, y, size). Paths only — no glyph fonts.
 */
export function legendOutlineFigures (icon: LegendOutlineName, x: number, y: number, size: number): LegendOutlineFigure[] {
  const s = size
  const cx = x + s / 2
  const cy = y + s / 2
  switch (icon) {
    case 'eye':
    case 'eye-off': {
      const figures: LegendOutlineFigure[] = [
        { name: 'polygon', coordinates: ellipse(cx, cy, s * 0.42, s * 0.26, 10) },
        { name: 'circle', x: cx, y: cy, r: s * 0.1 }
      ]
      if (icon === 'eye-off') {
        figures.push({
          name: 'line',
          coordinates: [point(x + s * 0.16, y + s * 0.78), point(x + s * 0.84, y + s * 0.22)]
        })
      }
      return figures
    }
    case 'gear': {
      const figures: LegendOutlineFigure[] = [
        { name: 'circle', x: cx, y: cy, r: s * 0.22 }
      ]
      const inner = s * 0.3
      const outer = s * 0.46
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        figures.push({
          name: 'line',
          coordinates: [
            point(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner),
            point(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
          ]
        })
      }
      return figures
    }
    case 'trash': {
      const left = x + s * 0.28
      const right = x + s * 0.72
      const top = y + s * 0.32
      const bottom = y + s * 0.82
      return [
        {
          name: 'line',
          coordinates: [point(x + s * 0.22, y + s * 0.28), point(x + s * 0.78, y + s * 0.28)]
        },
        {
          name: 'line',
          coordinates: [point(x + s * 0.4, y + s * 0.16), point(x + s * 0.6, y + s * 0.16)]
        },
        {
          name: 'polygon',
          coordinates: [point(left, top), point(right, top), point(right, bottom), point(left, bottom)]
        }
      ]
    }
    case 'more': {
      return [0.22, 0.5, 0.78].map(offset => ({
        name: 'circle' as const,
        x: x + s * offset,
        y: cy,
        r: s * 0.08
      }))
    }
    case 'chevron-down': {
      return [{
        name: 'line',
        coordinates: [
          point(x + s * 0.2, y + s * 0.36),
          point(cx, y + s * 0.66),
          point(x + s * 0.8, y + s * 0.36)
        ]
      }]
    }
    case 'chevron-up': {
      return [{
        name: 'line',
        coordinates: [
          point(x + s * 0.2, y + s * 0.64),
          point(cx, y + s * 0.34),
          point(x + s * 0.8, y + s * 0.64)
        ]
      }]
    }
  }
}

export interface ChartSeries {
  id: string
  label: string
  color: string
  data: number[]
}

export interface BarItem {
  label: string
  value: number
  max: number
  color?: string
}

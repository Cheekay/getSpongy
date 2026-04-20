// app/(manage)/events/[id]/analytics/CheckInChart.tsx
type Bucket = { hour: string; count: number }

function formatHour(iso: string): string {
  const date = new Date(iso)
  const h = date.getHours()
  const ampm = h < 12 ? 'am' : 'pm'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${ampm}`
}

export default function CheckInChart({ buckets }: { buckets: Bucket[] }) {
  if (buckets.length === 0) return null

  const maxCount = Math.max(...buckets.map((b) => b.count))
  const chartHeight = 80
  const barWidth = Math.min(32, Math.floor(280 / buckets.length) - 4)
  const chartWidth = buckets.length * (barWidth + 4)

  return (
    <div className="overflow-x-auto">
      <svg
        width={chartWidth}
        height={chartHeight + 24}
        className="min-w-full"
        aria-label="Check-in timeline bar chart"
      >
        {buckets.map((bucket, i) => {
          const barHeight = maxCount > 0 ? Math.round((bucket.count / maxCount) * chartHeight) : 0
          const x = i * (barWidth + 4)
          const y = chartHeight - barHeight

          return (
            <g key={bucket.hour}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill="#bcff5f"
                opacity={0.85}
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#acaab1"
              >
                {formatHour(bucket.hour)}
              </text>
              {bucket.count > 0 && barHeight > 16 && (
                <text
                  x={x + barWidth / 2}
                  y={y + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#3d6100"
                  fontWeight="700"
                >
                  {bucket.count}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

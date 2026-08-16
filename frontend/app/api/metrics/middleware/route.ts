import { NextResponse } from 'next/server'

// Export middleware metrics
const metrics = {
  requests: 0,
  errors: 0,
  latencies: [] as number[],
}

export async function GET() {
  const avgLatency = metrics.latencies.length > 0
    ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length
    : 0

  const p95Latency = metrics.latencies.length > 0
    ? metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.95)]
    : 0

  return NextResponse.json({
    requests: metrics.requests,
    errors: metrics.errors,
    avgLatencyMs: Math.round(avgLatency),
    p95LatencyMs: Math.round(p95Latency),
    errorRate: metrics.requests > 0 ? metrics.errors / metrics.requests : 0,
  })
}
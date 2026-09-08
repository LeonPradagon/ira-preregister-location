import { Injectable } from '@nestjs/common';

type Metric = { count: number; sum: number; max: number; samples: number[] };

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly observations = new Map<string, Metric>();

  increment(name: string, amount = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observe(name: string, value: number) {
    const current = this.observations.get(name) ?? { count: 0, sum: 0, max: 0, samples: [] };
    current.count += 1;
    current.sum += value;
    current.max = Math.max(current.max, value);
    current.samples.push(value);
    if (current.samples.length > 1000) current.samples.shift();
    this.observations.set(name, current);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      observations: Object.fromEntries(
        Array.from(this.observations.entries()).map(([name, metric]) => {
          const sorted = [...metric.samples].sort((a, b) => a - b);
          const percentile = (rank: number) =>
            sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * rank))] : 0;
          return [
            name,
            {
              count: metric.count,
              sum: metric.sum,
              max: metric.max,
              p50: percentile(0.5),
              p95: percentile(0.95),
              p99: percentile(0.99),
            },
          ];
        }),
      ),
      generatedAt: new Date().toISOString(),
    };
  }
}

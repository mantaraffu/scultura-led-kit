// Una barra per faccia: temperatura, umidità, CO2, PM10. Più tenue se il dato è vecchio.
const METRICS = ['temperature', 'humidity', 'co2', 'pm10'];
const COLORS = [[255, 120, 0], [0, 180, 255], [120, 255, 80], [255, 0, 160]];

export default {
  name: 'Barre dei sensori',
  author: 'scultura-led',
  space: 'strip',
  metrics: METRICS,
  params: { pulse: { min: 0, max: 1, default: 0.3 } },
  setup(p) {
    p.noStroke();
  },
  draw(p, ctx, data) {
    p.background(0);
    METRICS.forEach((metric, i) => {
      const { x, w, h } = ctx.column(i);
      const m = data.get(metric);
      const wave = 1 + ctx.params.pulse * 0.1 * Math.sin(ctx.time * 2 + i);
      const bar = Math.max(8, Math.min(h, (m ? m.norm : 0) * h * wave));
      const [r, g, b] = COLORS[i];
      p.fill(r, g, b, m && !m.stale ? 255 : 110);
      p.rect(x + 16, h - bar, w - 32, bar);
    });
  },
};

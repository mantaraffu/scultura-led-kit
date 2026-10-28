// Un disco che gira attorno alla scultura: lascia una faccia e ricompare sulla successiva.
export default {
  name: 'Orbita',
  author: 'scultura-led',
  space: 'panorama',
  metrics: ['temperature'],
  params: { speed: { min: 0.1, max: 3, default: 1 } },
  setup(p) {
    p.noStroke();
  },
  draw(p, ctx, data) {
    p.background(0);
    const t = data.get('temperature');
    const heat = t ? t.norm : 0.5;
    const x = ctx.wrapX(ctx.time * 160 * ctx.params.speed);
    const y = ctx.height * (0.5 + 0.35 * Math.sin(ctx.time * 0.7));
    p.fill(255 * heat, 80, 255 * (1 - heat));
    ctx.wrap(() => p.circle(x, y, 180));
  },
};

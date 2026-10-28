export const TEMPLATE_SOURCE = `export default {
  name: 'La mia scena',
  author: '',
  space: 'strip',
  metrics: ['temperature'],
  params: {
    velocita: { type: 'number', label: 'Velocità', min: 0, max: 2, step: 0.1, default: 0.5 },
  },
  setup(p) {
    p.noStroke();
  },
  draw(p, ctx, data) {
    p.background(8);
    const t = data.get('temperature');
    const norm = t ? t.norm : 0;
    const onda = 1 + ctx.params.velocita * 0.15 * Math.sin(ctx.time * 2);
    const altezza = Math.max(8, ctx.height * norm * onda);
    const larghezza = ctx.width / 3;
    p.fill(t && t.stale ? 120 : p.color(255, 120, 0));
    p.rect(ctx.width / 2 - larghezza / 2, ctx.height - altezza, larghezza, altezza);
    p.fill(255);
    p.textSize(28);
    p.textAlign(p.CENTER, p.TOP);
    p.text('Temperatura', ctx.width / 2, 28);
    osserva('altezza', altezza);
  },
};
`;

export default TEMPLATE_SOURCE;

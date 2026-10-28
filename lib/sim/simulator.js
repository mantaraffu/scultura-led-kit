// Valori plausibili: ciclo giorno/notte (minimo alle 4, massimo alle 16 ora italiana) più rumore.
export function createSimulator({ metrics, sensors = ['SIM1'], random = Math.random, now = () => Date.now() }) {
  return {
    name: 'simulator',
    async poll() {
      const t = now();
      const d = new Date(t);
      const hour = (d.getUTCHours() + 1 + d.getUTCMinutes() / 60) % 24; // ora italiana, ora solare
      const day = (1 - Math.cos(((hour - 4) / 24) * 2 * Math.PI)) / 2; // 0..1
      const ts = d.toISOString();
      return Object.entries(metrics).flatMap(([metric, def]) =>
        sensors.map((sensor) => {
          const k = 0.2 + 0.5 * day + 0.1 * (random() - 0.5);
          const value = Math.round((def.min + (def.max - def.min) * k) * 10) / 10;
          return { source: 'simulator', sensor, metric, value, ts, trend: null };
        }));
    },
  };
}

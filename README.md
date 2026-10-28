# Kit delle scene

Qui si scrive una scena per la scultura LED e la si vede subito **sulla scultura**,
senza installare niente: si apre la pagina e si scrive.

👉 **https://mantaraffu.github.io/scultura-led-kit/**

## Com'è fatta una scena

Un file `.js` solo, con dentro un oggetto:

```js
export default {
  name: 'La mia scena',
  author: 'Nome Cognome',
  space: 'strip',            // 'strip' = le quattro facce in fila; 'panorama' = tutto il giro
  metrics: ['temperature'],  // i dati che usi
  params: {                  // le manopole che l'autore potrà girare
    velocita: { type: 'number', label: 'Velocità', min: 0, max: 2, step: 0.1, default: 0.5 },
  },
  setup(p) { p.noStroke(); },
  draw(p, ctx, data) {
    p.background(0);
    const t = data.get('temperature');   // può non esserci: controlla sempre
    const altezza = (t ? t.norm : 0) * ctx.height;
    osserva('altezza', altezza);          // mostra il valore nella sezione Dati
    p.fill(255, 120, 0);
    p.rect(100, ctx.height - altezza, 300, altezza);
  },
};
```

- Il tempo si legge da `ctx.time` (secondi), mai da `frameCount`.
- La tela la crea il kit: niente `createCanvas`.
- `data.get(...)` può restituire `null` (dato mancante) o un dato `stale` (vecchio):
  una scena buona se la cava lo stesso.
- Fondo nero, colori saturi, spessori di almeno 3 px: sono LED, visti da lontano.

## Come si consegna

Premi **Controlla la scena**. Quando dice *Pronta da inviare*, premi **Salva**: scarichi
il tuo `.js` e lo consegni all'autore nel modo concordato in aula.

## Che cos'è questo repository

Solo il sito del kit, generato automaticamente da `npm run kit:publish` nel progetto
dell'opera. Non si modifica a mano: le modifiche fatte qui vengono sovrascritte alla
pubblicazione successiva.

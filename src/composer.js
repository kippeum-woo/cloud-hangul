// The message being written: draft blocks in the sky. Letters belong to the
// city's shared supply on the server, so every piece in a block is a server
// reservation { l, rid }. The composer never touches stock itself; each
// operation tells the caller which reservations to release, and undo of a
// removal tells it which letters it must claim again first.
import { addPiece, blockText, canAdd, compose, glyph } from "./hangul.js";
import { dxWrap, GLYPH, wrapX } from "./messages.js";

let nextId = 1;
const newId = () => `b${Date.now().toString(36)}${(nextId++).toString(36)}`;
const clone = (b) => ({ ...b, pieces: b.pieces.map((p) => ({ ...p })) });
const letters = (b) => b.pieces.map((p) => p.l);

export function createComposer({ blocks = [] } = {}) {
  let draft = blocks.map(clone);
  let history = [];
  const find = (id) => draft.find((b) => b.id === id);

  return {
    get blocks() {
      return draft;
    },
    get canUndo() {
      return history.length > 0;
    },
    text: (b) => blockText(letters(b)),
    rids: () => draft.flatMap((b) => b.pieces.map((p) => p.rid)),

    // What a block would show with one more piece, or null if not allowed.
    preview(id, letter) {
      const b = find(id);
      if (!b) return null;
      const next = addPiece(compose(letters(b)), letter);
      return next ? glyph(next) : null;
    },

    // The closest block within reach of (x, y), in sky units.
    nearest(x, y, reach = GLYPH * 0.85, exclude = null) {
      let best = null;
      for (const b of draft) {
        if (b.id === exclude) continue;
        const d = Math.hypot(dxWrap(b.x, x), b.y - y);
        if (d < reach && (!best || d < best.d)) best = { block: b, d };
      }
      return best?.block || null;
    },

    // Places a reserved piece. Joins targetId when the rules allow it,
    // otherwise starts a new block at (x, y).
    drop(letter, rid, x, y, targetId = null) {
      const target = targetId && find(targetId);
      if (target && canAdd(letters(target), letter)) {
        target.pieces.push({ l: letter, rid });
        history.push({ type: "add", id: target.id, created: false });
        return { block: target, joined: true };
      }
      const block = { id: newId(), x: wrapX(x), y, pieces: [{ l: letter, rid }] };
      draft.push(block);
      history.push({ type: "add", id: block.id, created: true });
      return { block, joined: false, rejected: Boolean(target) };
    },

    move(id, x, y) {
      const b = find(id);
      if (!b) return;
      history.push({ type: "move", id, from: { x: b.x, y: b.y } });
      b.x = wrapX(x);
      b.y = y;
    },

    // Each of these returns the reservation ids to release.
    remove(id) {
      const i = draft.findIndex((b) => b.id === id);
      if (i < 0) return [];
      const [b] = draft.splice(i, 1);
      history.push({ type: "remove", block: clone(b), index: i });
      return b.pieces.map((p) => p.rid);
    },
    pop(id) {
      const b = find(id);
      if (!b) return [];
      const i = draft.indexOf(b);
      const before = clone(b);
      const piece = b.pieces.pop();
      if (!b.pieces.length) draft.splice(i, 1);
      history.push({ type: "pop", block: before, index: i });
      return [piece.rid];
    },
    reset() {
      if (!draft.length) return [];
      const saved = draft.map(clone);
      draft = [];
      history.push({ type: "reset", blocks: saved });
      return saved.flatMap((b) => b.pieces.map((p) => p.rid));
    },

    // Undo. Returns { release } for steps that give pieces back, or
    // { need, apply } when pieces must be claimed again: the caller reserves
    // `need` letters and calls apply(newRids) in the same order, or drop()s
    // the step if the shared stock no longer has them.
    undo() {
      const h = history.pop();
      if (!h) return { release: [] };
      if (h.type === "add") {
        const b = find(h.id);
        if (!b) return { release: [] };
        const piece = b.pieces.pop();
        if (h.created || !b.pieces.length) draft = draft.filter((x) => x !== b);
        return { release: [piece.rid] };
      }
      if (h.type === "move") {
        const b = find(h.id);
        if (b) Object.assign(b, h.from);
        return { release: [] };
      }
      const targets = h.type === "reset" ? h.blocks : [h.block];
      const need = [];
      for (const t of targets) {
        const existing = find(t.id);
        for (const p of t.pieces.slice(existing ? existing.pieces.length : 0)) need.push(p.l);
      }
      return {
        need,
        apply: (rids) => {
          let k = 0;
          for (const t of targets) {
            const existing = find(t.id);
            const keep = existing ? existing.pieces.length : 0;
            const pieces = t.pieces.map((p, i) => (i < keep ? existing.pieces[i] : { l: p.l, rid: rids[k++] }));
            if (existing) existing.pieces = pieces;
            else draft.splice(Math.min(h.type === "reset" ? draft.length : h.index, draft.length), 0, { ...clone(t), pieces });
          }
        },
        drop: () => {},
      };
    },

    // Drops pieces whose reservations the server no longer has. Returns the
    // still-live rids that had to go too (a block that no longer composes in
    // order loses its later pieces), for the caller to release.
    forget(missing) {
      const gone = new Set(missing);
      const release = [];
      if (!gone.size) return release;
      for (const b of draft) {
        const kept = b.pieces.filter((p) => !gone.has(p.rid));
        b.pieces = [];
        for (const p of kept) {
          if (canAdd(b.pieces.map((q) => q.l), p.l)) b.pieces.push(p);
          else release.push(p.rid);
        }
      }
      draft = draft.filter((b) => b.pieces.length);
      history = [];
      return release;
    },

    // The draft as a publish request: anchor plus block offsets in glyph
    // cells, each block naming the reservations it is built from.
    toMessage() {
      if (!draft.length) return null;
      const ax = draft[0].x;
      const xs = draft.map((b) => ax + dxWrap(ax, b.x));
      const ys = draft.map((b) => b.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      return {
        x: wrapX(cx),
        y: cy,
        blocks: draft.map((b, i) => ({ dx: (xs[i] - cx) / GLYPH, dy: (b.y - cy) / GLYPH, pieces: b.pieces.map((p) => p.rid) })),
      };
    },

    // After publishing, the pieces are spent: clear without releasing.
    spend() {
      draft = [];
      history = [];
    },

    save() {
      return { blocks: draft.map(clone) };
    },
  };
}

// Restores a saved draft against the visitor's live server reservations
// ({ id, letter }). Pieces whose reservation expired are gone; live
// reservations the draft cannot use are returned in `release`.
export function restoreComposer(saved, live) {
  const byId = new Map(live.map((r) => [r.id, r.letter]));
  const used = new Set();
  const blocks = [];
  for (const b of Array.isArray(saved?.blocks) ? saved.blocks : []) {
    if (!b || typeof b.id !== "string" || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Array.isArray(b.pieces)) continue;
    const pieces = [];
    for (const p of b.pieces) {
      if (!p || byId.get(p.rid) !== p.l || used.has(p.rid) || !canAdd(pieces.map((q) => q.l), p.l)) continue;
      pieces.push({ l: p.l, rid: p.rid });
      used.add(p.rid);
    }
    if (pieces.length) blocks.push({ id: b.id, x: b.x, y: b.y, pieces });
  }
  return { composer: createComposer({ blocks }), release: live.map((r) => r.id).filter((id) => !used.has(id)) };
}

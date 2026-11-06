// Generated illustrations for idea cards and story avatars.
// Each idea gets a unique, repeatable picture: its topic's gradient and icon,
// plus soft shapes placed by a random generator seeded from the idea's id.
window.Art = (() => {
  const PAL = {
    productivity: ["#ff8a4c", "#d6365c"],
    psychology: ["#9a7bff", "#4a36b8"],
    learning: ["#35c79a", "#1b6f63"],
    money: ["#f2b632", "#c76a12"],
    health: ["#4fc6e8", "#2a6fd0"],
    communication: ["#ff74ac", "#b8336f"],
    creativity: ["#ffb347", "#f0543a"],
    thinking: ["#7690ff", "#33479e"],
    habits: ["#9ed35c", "#3e8a35"],
    daily: ["#ffcf5a", "#ff5a3d"],
    mine: ["#caa9ff", "#6d4bc4"],
    other: ["#b9a896", "#6a5e52"]
  };
  const ICON = {
    productivity: "clock", psychology: "mind", learning: "book", money: "coins", health: "heart",
    communication: "speech", creativity: "bulb", thinking: "compass", habits: "sprout",
    daily: "sun", mine: "pen", other: "spark"
  };
  // Icons drawn on a 100×100 grid, stroked in white.
  const GLYPH = {
    clock: '<circle cx="50" cy="50" r="34"/><path d="M50 30v20l13 9"/><path d="M50 10v4M50 86v4M10 50h4M86 50h4"/>',
    mind: '<path d="M38 80V68c-10-3-18-12-18-24a30 30 0 0 1 60 0c0 6-2 10-5 14l3 10h-8v6c0 3-2 6-6 6H38"/><path d="M42 38a8 8 0 0 1 14 0M50 38v14M44 52h12"/>',
    book: '<path d="M50 30C40 24 24 24 14 28v50c10-4 26-4 36 2 10-6 26-6 36-2V28c-10-4-26-4-36 2Z"/><path d="M50 30v50"/>',
    coins: '<ellipse cx="50" cy="28" rx="28" ry="9"/><path d="M22 28v16c0 5 12.5 9 28 9s28-4 28-9V28"/><path d="M22 44v16c0 5 12.5 9 28 9s28-4 28-9V44"/><path d="M22 60v14c0 5 12.5 9 28 9s28-4 28-9V60"/>',
    heart: '<path d="M50 82C20 62 13 46 17 34c4-12 22-16 33-2 11-14 29-10 33 2 4 12-3 28-33 48Z"/><path d="M28 50h10l5-8 7 16 5-8h17"/>',
    speech: '<path d="M18 22h44a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H36l-12 10V60h-6a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8Z"/><path d="M76 44h4a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6h-2v8l-10-8H54a6 6 0 0 1-6-6v-4"/>',
    bulb: '<path d="M50 16a24 24 0 0 0-14 43c3 3 5 6 5 10h18c0-4 2-7 5-10a24 24 0 0 0-14-43Z"/><path d="M42 78h16M44 87h12M50 4v4M18 18l3 3M82 18l-3 3M8 44h4M88 44h4"/>',
    compass: '<circle cx="50" cy="50" r="36"/><path d="M50 22l8 28-8 28-8-28Z" fill="#fff"/><path d="M50 8v6M50 86v6M8 50h6M86 50h6"/>',
    sprout: '<path d="M50 86V48"/><path d="M50 58c0-16-12-26-28-26 0 16 12 26 28 26Z"/><path d="M50 48c0-16 12-26 28-26 0 16-12 26-28 26Z"/><path d="M26 86h48"/>',
    sun: '<circle cx="50" cy="50" r="17"/><path d="M50 12v10M50 78v10M12 50h10M78 50h10M23 23l7 7M70 70l7 7M77 23l-7 7M30 70l-7 7"/>',
    pen: '<path d="M24 76l6-18 36-36 12 12-36 36Z"/><path d="M58 30l12 12M24 76l18-6"/>',
    spark: '<path d="M50 14c4 24 12 32 36 36-24 4-32 12-36 36-4-24-12-32-36-36 24-4 32-12 36-36Z"/>'
  };

  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = hash(seed);
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const key = (t) => { const k = String(t || "").toLowerCase(); return PAL[k] ? k : "other"; };
  let n = 0;
  const glyphGroup = (k, tf, stroke, extra = "") =>
    `<g transform="${tf}" fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${GLYPH[ICON[k]]}</g>`;

  // Wide card illustration (400×240, cropped to fill whatever box it sits in).
  function svg(idea, { center = false } = {}) {
    const k = key(idea.topic), [c1, c2] = PAL[k], r = rng(idea.id || idea.title), id = "ag" + (++n);
    const W = 400, H = 240;
    let shapes = "";
    for (let i = 0; i < 3; i++) shapes += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(60 + r() * 110).toFixed(0)}" fill="#fff" opacity="${(0.06 + r() * 0.1).toFixed(2)}"/>`;
    shapes += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(26 + r() * 46).toFixed(0)}" fill="none" stroke="#fff" stroke-width="2" opacity=".28"/>`;
    const gx = 20 + r() * 300, gy = 18 + r() * 150;
    for (let x = 0; x < 6; x++) for (let y = 0; y < 4; y++) shapes += `<circle cx="${(gx + x * 13).toFixed(0)}" cy="${(gy + y * 13).toFixed(0)}" r="2" fill="#fff" opacity=".32"/>`;
    const side = r();
    const cx = center ? 200 : side < 0.33 ? 128 : side < 0.66 ? 200 : 272;
    const cy = 120 + (r() - 0.5) * 16, s = 1.45 + r() * 0.3, rot = ((r() - 0.5) * 18).toFixed(1);
    const tf = (dx, dy) => `translate(${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}) rotate(${rot}) scale(${s.toFixed(2)}) translate(-50 -50)`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${id})"/>${shapes}
      ${glyphGroup(k, tf(5, 7), "#000", 'opacity=".14"')}${glyphGroup(k, tf(0, 0), "#fff")}
    </svg>`;
  }

  // Round avatar for the stories row.
  function avatar(topic) {
    const k = key(topic), [c1, c2] = PAL[k], id = "av" + (++n);
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="100" height="100" fill="url(#${id})"/><circle cx="78" cy="20" r="26" fill="#fff" opacity=".12"/>
      ${glyphGroup(k, "translate(50 52) scale(.6) translate(-50 -50)", "#fff", 'stroke-width="7"')}</svg>`;
  }

  return { svg, avatar, palette: (t) => PAL[key(t)], rng };
})();

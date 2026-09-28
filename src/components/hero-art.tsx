/**
 * Decorative science line art for the home title (server-rendered SVG,
 * hidden from assistive technology): an atom, a DNA helix, a benzene ring,
 * an Erlenmeyer flask, a sine wave, and a few formulas.
 */

const LINE = "rgba(255,255,255,0.55)";
const FAINT = "rgba(255,255,255,0.22)";
const BLUE = "#6ea8ff";
const ORANGE = "#f59a4a";

function Atom({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={LINE} strokeWidth="1.6">
      {[0, 60, 120].map((a) => (
        <ellipse key={a} rx={r} ry={r * 0.36} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.13} fill={BLUE} stroke="none" />
      <circle cx={r} cy={0} r={r * 0.06} fill={ORANGE} stroke="none" transform="rotate(60)" />
      <circle cx={-r} cy={0} r={r * 0.06} fill="#fff" stroke="none" transform="rotate(120)" />
    </g>
  );
}

function Helix({ x, y, h, w }: { x: number; y: number; h: number; w: number }) {
  const steps = 48;
  const turns = 2.25;
  const pt = (i: number, phase: number) => {
    const t = i / steps;
    return [x + (w / 2) * Math.sin(t * turns * 2 * Math.PI + phase), y + t * h] as const;
  };
  const strand = (phase: number) =>
    Array.from({ length: steps + 1 }, (_, i) => pt(i, phase))
      .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ");
  const rungs = Array.from({ length: 13 }, (_, k) => Math.round((k + 0.5) * (steps / 13)));
  return (
    <g fill="none" strokeLinecap="round">
      {rungs.map((i) => {
        const [ax, ay] = pt(i, 0);
        const [bx, by] = pt(i, Math.PI);
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={FAINT} strokeWidth="1.4" />;
      })}
      <path d={strand(0)} stroke={BLUE} strokeWidth="2" opacity="0.85" />
      <path d={strand(Math.PI)} stroke={ORANGE} strokeWidth="2" opacity="0.75" />
    </g>
  );
}

function Benzene({ x, y, r }: { x: number; y: number; r: number }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
  });
  return (
    <g fill="none" stroke={LINE} strokeWidth="1.5">
      <polygon points={pts.map((p) => p.join(",")).join(" ")} />
      <circle cx={x} cy={y} r={r * 0.55} stroke={FAINT} />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="2.4" fill={i % 2 ? BLUE : "#fff"} stroke="none" />
      ))}
    </g>
  );
}

function Flask({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" strokeWidth={1.6 / s} strokeLinejoin="round">
      <path d="M-8,-30 L-8,-8 L-24,22 Q-26,28 -20,28 L20,28 Q26,28 24,22 L8,-8 L8,-30" stroke={LINE} />
      <line x1="-11" y1="-30" x2="11" y2="-30" stroke={LINE} />
      <path d="M-18.5,12 L18.5,12 L22.5,22 Q24,26 19,26 L-19,26 Q-24,26 -22.5,22 Z" fill={BLUE} opacity="0.35" stroke="none" />
      <circle cx="-4" cy="18" r="2.2" fill="#fff" opacity="0.6" />
      <circle cx="5" cy="8" r="1.6" fill="#fff" opacity="0.5" />
      <circle cx="1" cy="-2" r="1.2" fill="#fff" opacity="0.4" />
    </g>
  );
}

export function HeroArt() {
  const wave = Array.from({ length: 61 }, (_, i) => {
    const px = 470 + i * 5;
    const py = 196 + 10 * Math.sin(i / 4.2);
    return `${i ? "L" : "M"}${px},${py.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="hero-art" viewBox="0 0 800 240" preserveAspectRatio="xMaxYMid slice" aria-hidden focusable="false">
      <Helix x={742} y={-10} h={260} w={46} />
      <Atom x={640} y={78} r={52} />
      <Benzene x={520} y={62} r={24} />
      <Flask x={690} y={176} s={1.05} />
      <path d={wave} fill="none" stroke={ORANGE} strokeWidth="1.6" opacity="0.55" />
      <g fill={FAINT} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="13">
        <text x="560" y="150">E = mc²</text>
        <text x="500" y="228">PV = nRT</text>
        <text x="610" y="228">F = ma</text>
        <text x="560" y="22">H₂O</text>
      </g>
    </svg>
  );
}

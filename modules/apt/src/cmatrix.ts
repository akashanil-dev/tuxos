import type { CommandContext } from '@tuxos/shell';

const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*+=:<>/';
const COLORS: Record<string, number> = { green: 32, red: 31, blue: 34, yellow: 33, cyan: 36, magenta: 35, white: 37 };

export async function cmatrix(ctx: CommandContext): Promise<number> {
  if (ctx.args.includes('-h') || ctx.args.includes('--help')) {
    ctx.stdout('Usage: cmatrix [-b] [-C green|red|blue|yellow|cyan|magenta|white]\nFalling Matrix characters. Press Ctrl+C to exit.\n');
    return 0;
  }
  let color = 32;
  for (let i = 0; i < ctx.args.length; i++) {
    if (ctx.args[i] === '-b' || ctx.args[i] === '-B') continue;
    if (ctx.args[i] === '-C' && COLORS[ctx.args[i + 1]!]) { color = COLORS[ctx.args[++i]!]!; continue; }
    ctx.stderr('cmatrix: unsupported option. Try cmatrix --help.\n');
    return 1;
  }
  const columns = Math.max(10, Math.min(ctx.terminal?.columns ?? 60, 180) - 1);
  const rows = Math.max(4, Math.min(ctx.terminal?.rows ?? 18, 70) - 2);
  const heads = Array.from({ length: Math.ceil(columns / 2) }, () => Math.floor(Math.random() * rows));
  const lengths = heads.map(() => 4 + Math.floor(Math.random() * Math.max(4, rows / 2)));
  const frame = () => Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < columns; col++) {
      const stream = Math.floor(col / 2);
      const distance = (heads[stream]! - row + rows) % rows;
      line += col % 2 || distance > lengths[stream]! ? ' '
        : `\x1b[${distance === 0 ? '1;37' : `${distance > lengths[stream]! / 2 ? 2 : 0};${color}`}m${GLYPHS[Math.floor(Math.random() * GLYPHS.length)]}`;
    }
    return line + '\x1b[0m';
  }).join('\n');

  if (!ctx.terminal || !ctx.signal) {
    ctx.stdout(frame() + '\n');
    return 0;
  }
  ctx.stdout('\x1b[?1049h\x1b[?25l\x1b[2J');
  try {
    while (!ctx.signal.aborted) {
      ctx.stdout(`\x1b[H${frame()}\n\x1b[0;32mcmatrix · Ctrl+C to exit\x1b[0m`);
      for (let i = 0; i < heads.length; i++) heads[i] = (heads[i]! + 1) % rows;
      await pause(90, ctx.signal);
    }
  } finally {
    ctx.stdout('\x1b[0m\x1b[?25h\x1b[?1049l');
  }
  return 130;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

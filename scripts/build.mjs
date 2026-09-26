import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const TAILWIND_CLI = 'node_modules/@tailwindcss/cli/dist/index.mjs';

/** Runs the Tailwind CLI and returns the compiled CSS. */
function tailwind(input) {
  return execFileSync(process.execPath, [TAILWIND_CLI, '-i', input, ...(watch ? [] : ['--minify'])], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/**
 * Tailwind v4 registers its internal --tw-* variables with @property, which
 * Chrome ignores inside shadow roots — so shadows, rings and transforms would
 * silently break. Emit their initial values as plain declarations instead.
 */
function shadowDomFix(css) {
  const decls = [];
  for (const [, name, body] of css.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)) {
    const initial = /initial-value:\s*([^;]+)/.exec(body);
    if (initial) decls.push(`${name}:${initial[1].trim()}`);
  }
  return `${css}\n@layer properties{:host,*,::before,::after,::backdrop{${decls.join(';')}}}\n`;
}

/** `import css from 'virtual:ui-css'` → compiled Tailwind for the injected (shadow DOM) UI. */
const tailwindPlugin = {
  name: 'tailwind',
  setup(build) {
    build.onResolve({ filter: /^virtual:ui-css$/ }, () => ({ path: 'ui-css', namespace: 'tailwind' }));
    build.onLoad({ filter: /.*/, namespace: 'tailwind' }, () => ({
      contents: shadowDomFix(tailwind('src/styles/ui.css')) + readFileSync('src/styles/theme.css', 'utf8'),
      loader: 'text',
      watchFiles: ['src/styles/ui.css', 'src/styles/theme.css'],
      watchDirs: ['src/content'],
    }));
    // The popup is a normal extension page, so it gets a plain stylesheet.
    build.onStart(() => {
      writeFileSync('dist/popup.css', tailwind('src/popup/popup.css'));
    });
  },
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
cpSync('src/popup/popup.html', 'dist/popup.html');

const ctx = await esbuild.context({
  entryPoints: {
    content: 'src/content/index.ts',
    background: 'src/background.ts',
    popup: 'src/popup/popup.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
  plugins: [tailwindPlugin],
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

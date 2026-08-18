import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Guards the theme token layer in src/index.css.
 *
 * Two things can silently break it, and neither shows up in `tsc` or a build:
 *
 *  1. The Light palette is declared twice — once for `[data-theme="light"]` and
 *     once inside `@media (prefers-color-scheme: light)` for
 *     `[data-theme="system"]`. CSS has no mixins, so the duplication is real,
 *     and a value edited in one block but not the other means the app looks
 *     different depending on how the user picked the same theme.
 *
 *  2. A `--color-*` token in `@theme` can point at a private `--_*` value that
 *     no palette defines. Tailwind still emits the utility; it just resolves to
 *     nothing at runtime — the exact failure mode behind the HomeHero ring
 *     track, which references a variable that was never declared.
 */

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** Every `--name: value;` declaration inside a block, as an ordered map. */
function declarations(block: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        out.set(match[1], match[2].trim());
    }
    return out;
}

/**
 * Extracts the body of the first block whose header matches `selector`,
 * balancing braces so nested at-rules do not truncate it.
 */
function block(selector: string): string {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `selector not found in index.css: ${selector}`);
    const open = css.indexOf('{', start);
    assert.notEqual(open, -1, `no opening brace after ${selector}`);

    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
            depth--;
            if (depth === 0) return css.slice(open + 1, i);
        }
    }
    throw new Error(`unbalanced braces after ${selector}`);
}

describe('theme tokens', () => {
    it('the two Light palette blocks declare identical values', () => {
        const explicit = declarations(block('[data-theme="light"] {'));
        const system = declarations(block('[data-theme="system"] {'));

        assert.ok(explicit.size > 0, 'the [data-theme="light"] block declares tokens');

        const names = [...new Set([...explicit.keys(), ...system.keys()])].sort();
        const drift = names
            .filter((name) => explicit.get(name) !== system.get(name))
            .map((name) => `${name}: light=${explicit.get(name)} system=${system.get(name)}`);

        assert.deepEqual(
            drift,
            [],
            'the [data-theme="light"] and prefers-color-scheme:light blocks have drifted apart',
        );
    });

    it('every @theme token resolves to a value some palette defines', () => {
        const theme = declarations(block('@theme {'));

        const defined = new Set<string>();
        for (const selector of ['[data-theme="light"] {', ':root,', '[data-theme="system"] {']) {
            for (const name of declarations(block(selector)).keys()) defined.add(name);
        }

        const dangling: string[] = [];
        for (const [token, value] of theme) {
            const reference = /^var\((--[\w-]+)\)$/.exec(value);
            if (!reference) continue; // a literal such as --color-primary: #135bec
            if (!defined.has(reference[1])) dangling.push(`${token} -> ${reference[1]}`);
        }

        assert.deepEqual(dangling, [], '@theme tokens pointing at undeclared private values');
    });

    it('the Dark palette defines every private value the Light palette does', () => {
        const dark = new Set(declarations(block(':root,')).keys());
        const light = [...declarations(block('[data-theme="light"] {')).keys()];

        const missing = light.filter((name) => !dark.has(name));
        assert.deepEqual(missing, [], 'private values declared only in the Light palette');
    });
});

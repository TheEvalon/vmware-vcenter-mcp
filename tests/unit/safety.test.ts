import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config.js';
import { buildPreview, ok, safeReadOnly, withConfirm } from '../../src/tools/_safety.js';
import { setLogLevel } from '../../src/utils/logger.js';

setLogLevel('error');

const PRESERVED = ['VCENTER_HOST', 'VCENTER_USER', 'VCENTER_PASS', 'VCENTER_READ_ONLY'] as const;
const snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of PRESERVED) snapshot[k] = process.env[k];
  process.env['VCENTER_HOST'] = 'h';
  process.env['VCENTER_USER'] = 'u';
  process.env['VCENTER_PASS'] = 'p';
  delete process.env['VCENTER_READ_ONLY'];
  resetConfigForTests();
});

afterEach(() => {
  for (const k of PRESERVED) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  resetConfigForTests();
});

describe('withConfirm', () => {
  it('returns a dry-run when confirm is omitted', async () => {
    const handler = withConfirm<{ confirm?: boolean; vmId: string }>(
      'tool',
      (input) => buildPreview('tool', `Would delete ${input.vmId}`, input),
      async () => ok('should not run'),
    );
    const result = await handler({ vmId: 'vm-1' });
    expect(result.structuredContent).toMatchObject({ dryRun: true, tool: 'tool' });
  });

  it('executes the handler when confirm is true', async () => {
    let called = false;
    const handler = withConfirm<{ confirm?: boolean }>(
      'tool',
      () => buildPreview('tool', 'preview', {}),
      async () => {
        called = true;
        return ok('done', { ran: true });
      },
    );
    await handler({ confirm: true });
    expect(called).toBe(true);
  });

  it('blocks execution when VCENTER_READ_ONLY=true', async () => {
    process.env['VCENTER_READ_ONLY'] = 'true';
    resetConfigForTests();
    const handler = withConfirm<{ confirm?: boolean }>(
      'tool',
      () => buildPreview('tool', 'preview', {}),
      async () => ok('should not run'),
    );
    const result = await handler({ confirm: true });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/read-only/i);
  });

  it('captures handler errors and returns isError', async () => {
    const handler = withConfirm<{ confirm?: boolean }>(
      'tool',
      () => buildPreview('tool', 'preview', {}),
      async () => {
        throw new Error('kaboom');
      },
    );
    const result = await handler({ confirm: true });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/kaboom/);
  });
});

describe('safeReadOnly', () => {
  it('passes through normal results', async () => {
    const handler = safeReadOnly<{}>('readonly', async () => ok('hi', { x: 1 }));
    const result = await handler({});
    expect(result.structuredContent).toEqual({ x: 1 });
  });

  it('captures errors', async () => {
    const handler = safeReadOnly<{}>('readonly', async () => {
      throw new Error('nope');
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
  });
});

describe('ok() text body', () => {
  it('returns text-only when no structured content is provided', () => {
    const result = ok('plain summary');
    expect(result.content[0]?.text).toBe('plain summary');
    expect(result.structuredContent).toBeUndefined();
  });

  it('embeds structured content as a JSON code fence in the text body', () => {
    const result = ok('Found 2 thing(s)', { count: 2, things: [{ id: 'a' }, { id: 'b' }] });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/^Found 2 thing\(s\)/);
    expect(text).toContain('```json');
    expect(text).toContain('"count": 2');
    expect(text).toContain('"id": "a"');
    expect(result.structuredContent).toEqual({ count: 2, things: [{ id: 'a' }, { id: 'b' }] });
  });

  it('truncates the embedded JSON when the payload exceeds the size cap', () => {
    const huge = { count: 1, items: [{ blob: 'x'.repeat(20000) }] };
    const result = ok('Found 1 huge thing', huge);
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('truncated');
    expect(text.length).toBeLessThan(20000);
    expect(result.structuredContent).toEqual(huge);
  });

  it('keeps the original lean text when structured content fails to serialize', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    const result = ok('summary', circular);
    expect(result.content[0]?.text).toBe('summary');
    expect(result.structuredContent).toBe(circular);
  });
});

import { expect } from 'vitest';
import type { CallToolResult } from './mcp-client.js';

/**
 * Concatenates every text-content item into a single string so test
 * assertions can match against the human-readable surface the server emits.
 */
const joinText = (result: CallToolResult): string =>
  result.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n');

/**
 * Asserts a successful read-only or non-destructive tool call: no isError,
 * non-empty text content, and (when expected) a structuredContent payload.
 */
export const expectOk = (
  result: CallToolResult,
  options: { requireStructured?: boolean } = { requireStructured: true },
): void => {
  if (result.isError === true) {
    throw new Error(`Expected success, got isError=true with text: ${joinText(result)}`);
  }
  expect(Array.isArray(result.content)).toBe(true);
  expect(result.content.length).toBeGreaterThan(0);
  if (options.requireStructured) {
    expect(result.structuredContent).toBeDefined();
    expect(typeof result.structuredContent).toBe('object');
  }
};

/**
 * Asserts the response is a dry-run preview emitted by the safety wrapper:
 * `structuredContent.dryRun === true`, the tool name matches, and a
 * request envelope is present.
 */
export const expectDryRun = (result: CallToolResult, toolName: string): void => {
  if (result.isError === true) {
    throw new Error(
      `Expected dry-run preview for ${toolName}, got isError=true. Text: ${joinText(result).slice(0, 600)}`,
    );
  }
  if (!result.structuredContent) {
    throw new Error(
      `Expected dry-run preview for ${toolName}, got no structuredContent. Text: ${joinText(result).slice(0, 600)}`,
    );
  }
  const sc = result.structuredContent as Record<string, unknown>;
  expect(sc['dryRun'], `${toolName}.structuredContent.dryRun`).toBe(true);
  expect(sc['tool'], `${toolName}.structuredContent.tool`).toBe(toolName);
  expect(sc).toHaveProperty('summary');
  expect(sc).toHaveProperty('request');
  expect(sc).toHaveProperty('hint');
  expect(joinText(result)).toMatch(/^DRY RUN:/);
};

/**
 * Asserts the response is the read-only kill-switch refusal. The safety
 * wrapper short-circuits with `isError:true` and a message containing the
 * READ_ONLY_HINT phrase.
 */
export const expectReadOnlyBlocked = (result: CallToolResult, toolName: string): void => {
  expect(result.isError).toBe(true);
  const text = joinText(result);
  expect(text).toContain(toolName);
  expect(text).toMatch(/read-only mode/i);
  expect(text).toMatch(/VCENTER_READ_ONLY=false/);
};

/**
 * Pulls the structuredContent off a CallToolResult typed as a specific shape.
 * Throws if it is missing so the test surfaces the failure crisply.
 */
export const requireStructured = <T>(result: CallToolResult): T => {
  if (!result.structuredContent) {
    throw new Error(
      `Tool result is missing structuredContent. Text: ${joinText(result).slice(0, 500)}`,
    );
  }
  return result.structuredContent as T;
};

export const textOf = joinText;

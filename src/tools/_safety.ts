import { z } from 'zod';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { VCenterError } from '../client/errors.js';

/**
 * Optional fields that every confirm-gated tool's structuredContent may
 * include when the safety wrapper short-circuits to a dry-run preview.
 *
 * MCP SDK 1.x validates structuredContent against the registered
 * outputSchema and rejects non-conforming responses with `-32602`. Because
 * the MCP spec requires outputSchema to be a single object schema (not a
 * union), we extend each tool's schema with these optional preview fields
 * via `dryRunCompatibleOutput()` so both the executed and dry-run shapes
 * pass validation.
 */
const DRY_RUN_PREVIEW_FIELDS = {
  dryRun: z.literal(true).optional(),
  tool: z.string().optional(),
  summary: z.string().optional(),
  request: z.unknown().optional(),
  hint: z.string().optional(),
} as const;

/**
 * Builds an outputSchema that accepts both the tool's executed result shape
 * and the safety wrapper's dry-run preview. All fields become optional so
 * the same single object schema validates both responses; in practice the
 * executed handler always populates the executed fields and the dry-run
 * path always populates the preview fields.
 *
 * @param executedSchema - the strict schema describing a confirmed-execution response.
 * @returns a permissive Zod object schema covering both shapes.
 */
export const dryRunCompatibleOutput = <T extends z.ZodRawShape>(
  executedSchema: z.ZodObject<T>,
): z.ZodObject<z.ZodRawShape> =>
  executedSchema.partial().extend(DRY_RUN_PREVIEW_FIELDS) as unknown as z.ZodObject<z.ZodRawShape>;

/**
 * Standard MCP tool result shape used by every tool in this package.
 * `content` is the human-readable surface, `structuredContent` mirrors the
 * tool's outputSchema for programmatic consumers. The MCP SDK requires
 * structuredContent to be an index-signature object so we widen here.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface DryRunPreview {
  dryRun: true;
  tool: string;
  summary: string;
  request: unknown;
  hint: string;
  [key: string]: unknown;
}

const READ_ONLY_HINT = 'Server is running in read-only mode (VCENTER_READ_ONLY=true). Set VCENTER_READ_ONLY=false to enable writes.';

/**
 * Wraps a destructive tool handler so it short-circuits to a dry-run preview
 * unless the caller passes `confirm: true` in the input.
 *
 * Also enforces the global VCENTER_READ_ONLY kill-switch: when enabled the
 * tool always refuses, even if `confirm` is true.
 */
export const withConfirm = <TInput extends { confirm?: boolean }>(
  toolName: string,
  preview: (input: TInput) => DryRunPreview | Promise<DryRunPreview>,
  handler: (input: TInput) => Promise<ToolResult>,
): ((input: TInput) => Promise<ToolResult>) => {
  return async (input: TInput) => {
    const config = loadConfig();
    if (config.readOnly) {
      logger.warn('Refusing destructive tool call due to VCENTER_READ_ONLY', { tool: toolName });
      return {
        isError: true,
        content: [{ type: 'text', text: `${toolName} blocked: ${READ_ONLY_HINT}` }],
      };
    }
    if (input.confirm !== true) {
      const dryRun = await preview(input);
      logger.info('Tool dry-run preview', { tool: toolName });
      return {
        content: [
          {
            type: 'text',
            text: `DRY RUN: ${dryRun.summary}\n${dryRun.hint}`,
          },
        ],
        structuredContent: dryRun,
      };
    }
    try {
      return await handler(input);
    } catch (err) {
      return formatError(toolName, err);
    }
  };
};

/**
 * Wraps a read-only tool handler with consistent error formatting. Read-only
 * tools never need a confirm flag.
 */
export const safeReadOnly = <TInput>(
  toolName: string,
  handler: (input: TInput) => Promise<ToolResult>,
): ((input: TInput) => Promise<ToolResult>) => {
  return async (input: TInput) => {
    try {
      return await handler(input);
    } catch (err) {
      return formatError(toolName, err);
    }
  };
};

const formatError = (toolName: string, err: unknown): ToolResult => {
  const message = err instanceof Error ? err.message : String(err);
  const details = err instanceof VCenterError ? { status: err.status, code: err.code, details: err.details } : undefined;
  logger.error(`${toolName} failed`, { message, ...(details ?? {}) });
  return {
    isError: true,
    content: [{ type: 'text', text: `${toolName} failed: ${message}` }],
  };
};

/**
 * Helper to build a DryRunPreview consistently across tools.
 */
export const buildPreview = (
  toolName: string,
  summary: string,
  request: unknown,
  hint = 'Re-run with confirm:true to execute.',
): DryRunPreview => ({
  dryRun: true,
  tool: toolName,
  summary,
  request,
  hint,
});

/**
 * Maximum number of characters of pretty-printed JSON to embed inline in the
 * text body of a ToolResult. Beyond this we truncate and emit a hint so the
 * caller knows the full payload still lives in `structuredContent`.
 */
const MAX_EMBEDDED_JSON_LENGTH = 12000;

/**
 * Wraps a structuredContent payload into a standard ToolResult.
 *
 * The MCP SDK requires `structuredContent` to be `{[k: string]: unknown}`;
 * callers usually pass narrower typed objects, so we cast internally.
 *
 * Many MCP clients (notably Cursor) only surface `content[0].text` to the
 * model and silently drop `structuredContent`. To stay client-agnostic we
 * also embed a JSON code fence of `structuredContent` directly in the text
 * body, so any consumer reading only the text still sees the data. Tools
 * with no structured payload (write tools that just acknowledge an action)
 * keep their original lean text output.
 */
export const ok = (text: string, structuredContent?: object): ToolResult => {
  if (structuredContent === undefined) {
    return { content: [{ type: 'text', text }] };
  }
  const embedded = formatStructuredAsText(structuredContent);
  const body = embedded ? `${text}\n\n${embedded}` : text;
  return {
    content: [{ type: 'text', text: body }],
    structuredContent: structuredContent as Record<string, unknown>,
  };
};

/**
 * Renders a JSON code-fence of the structured content, truncated when it
 * exceeds `MAX_EMBEDDED_JSON_LENGTH`. Returns an empty string on serialization
 * failure so the caller can fall back to text-only output gracefully.
 */
const formatStructuredAsText = (structured: object): string => {
  let json: string;
  try {
    json = JSON.stringify(structured, null, 2);
  } catch {
    return '';
  }
  if (!json) return '';
  if (json.length <= MAX_EMBEDDED_JSON_LENGTH) {
    return `\`\`\`json\n${json}\n\`\`\``;
  }
  const truncated = json.slice(0, MAX_EMBEDDED_JSON_LENGTH);
  return `\`\`\`json\n${truncated}\n... [truncated; full payload available in structuredContent]\n\`\`\``;
};

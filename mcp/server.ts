/**
 * Claim Guard MCP server (stdio). Run with `npm run mcp`.
 * stdout carries the protocol only; diagnostics go to stderr.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { decodeImage, MAX_IMAGE_BYTES, parseScoresInput, RequestError } from "../lib/brand-api";
import { claimCheck, thresholdsInUse } from "../lib/claim-check";
import { PRODUCT_CATEGORIES, policyRows } from "../lib/claim-policy";

const isJpegOrPng = (b: Buffer) =>
  (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));

/** A local file path, a data URL, or raw base64. */
function loadImage(v: string, label: string): Buffer {
  const s = v.trim();
  if (!s.startsWith("data:") && s.length < 1024 && existsSync(s)) {
    const st = statSync(s);
    if (!st.isFile()) throw new RequestError(`${label} is not a file`);
    if (st.size > MAX_IMAGE_BYTES) throw new RequestError(`${label} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    const b = readFileSync(s);
    if (!isJpegOrPng(b)) throw new RequestError(`${label} is not a JPEG or PNG`);
    return b;
  }
  return decodeImage(s, label);
}

const scoresSchema = z
  .union([
    z.array(z.object({ type: z.string(), ui_score: z.number(), raw_score: z.number() }).passthrough()),
    z.record(z.string(), z.object({ ui: z.number(), raw: z.number() })),
  ])
  .describe("YouCam output array of {type, ui_score, raw_score}, or a map like {moisture:{ui,raw}, radiance:{ui,raw}}");

const server = new McpServer({ name: "claim-guard", version: "0.1.0" });

server.registerTool(
  "claim_check",
  {
    title: "Check a before/after claim",
    description:
      "Checks whether a before/after skin analysis result may be shown as an improvement badge. Takes YouCam scores for both photos plus both photos. Makes no YouCam call.",
    inputSchema: {
      before_scores: scoresSchema,
      after_scores: scoresSchema,
      before_image: z.string().describe("Local file path to a JPEG/PNG (up to 4 MB), or base64 / data URL"),
      after_image: z.string().describe("Local file path to a JPEG/PNG (up to 4 MB), or base64 / data URL"),
      product_category: z.enum(PRODUCT_CATEGORIES).optional().describe("If set, the claim type check is applied"),
    },
  },
  async (args) => {
    try {
      const before = parseScoresInput(args.before_scores);
      const after = parseScoresInput(args.after_scores);
      if (!before || !after) {
        throw new RequestError("before_scores and after_scores must contain moisture, pore, wrinkle or radiance with ui and raw values between 0 and 100");
      }
      const r = await claimCheck({
        before,
        after,
        beforeImage: loadImage(args.before_image, "before_image"),
        afterImage: loadImage(args.after_image, "after_image"),
        product: args.product_category,
      });
      const allowed = r.metrics.filter((m) => m.badge).map((m) => m.metric);
      const summary = allowed.length
        ? `Badge allowed: ${allowed.join(", ")}`
        : !r.conditions.match
          ? "No badge: photos not comparable"
          : "No badge: no metric passed all checks";
      return { content: [{ type: "text" as const, text: `${summary}\n\n${JSON.stringify(r, null, 2)}` }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("claim_check failed:", msg);
      return { isError: true, content: [{ type: "text" as const, text: msg }] };
    }
  },
);

const EXPLANATION = [
  "A badge is allowed for a metric only if all five checks pass, in this order:",
  "1. Same file: the before and after photos must not be the same file.",
  "2. Claim type: the product category must be allowed to claim this metric (skin claim or appearance claim). Skipped when no product_category is sent.",
  "3. Capture conditions: the two photos must be taken under similar conditions. Face brightness relative to the background, backlight, and the background light colour must not change by more than the limits below.",
  "4. Noise floor: the raw score change must exceed the MDC95 for that metric, the smallest change that is larger than the measurement noise at 95 percent confidence.",
  "5. Display change: the displayed (ui) score must move by at least 1 point, so the badge shows a real number.",
].join("\n");

server.registerTool(
  "explain_thresholds",
  {
    title: "Explain the thresholds in use",
    description: "Returns the limits Claim Guard applies, the claim policy by product category, and a plain-English description of the five checks.",
  },
  async () => ({
    content: [
      {
        type: "text" as const,
        text: `${EXPLANATION}\n\n${JSON.stringify({ thresholds: thresholdsInUse(), claim_policy: policyRows() }, null, 2)}`,
      },
    ],
  }),
);

server.connect(new StdioServerTransport()).then(() => console.error("claim-guard MCP server ready on stdio"));

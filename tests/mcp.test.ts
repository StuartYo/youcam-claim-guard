import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import scores from "../data/scores.json";

const root = path.resolve(__dirname, "..");
const text = (r: any) => (r.content as Array<{ type: string; text: string }>)[0].text;

describe("claim-guard MCP server", () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, "node_modules/tsx/dist/cli.mjs"), "mcp/server.ts"],
      cwd: root,
      stderr: "ignore",
    });
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
  });

  it("lists both tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("claim_check");
    expect(names).toContain("explain_thresholds");
  }, 60_000);

  it("explain_thresholds returns thresholds and policy", async () => {
    const r = await client.callTool({ name: "explain_thresholds", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Noise floor");
    expect(text(r)).toContain("claim_policy");
  }, 60_000);

  it("claim_check allows the foundation radiance badge on the demo photos", async () => {
    const r = await client.callTool({
      name: "claim_check",
      arguments: {
        before_scores: scores.baselines[0].scores,
        after_scores: scores.simulated[0].scores,
        before_image: path.join(root, "public/demo/IMG_1407_1920.jpg"),
        after_image: path.join(root, "public/demo/IMG_1407_foundation1.jpg"),
        product_category: "foundation",
      },
    });
    expect(r.isError).toBeFalsy();
    const t = text(r);
    expect(t.startsWith("Badge allowed")).toBe(true);
    const json = JSON.parse(t.slice(t.indexOf("{")));
    expect(json.badge_allowed).toBe(true);
    expect(json.metrics.find((m: any) => m.metric === "radiance").verdict).toBe("claimable");
  }, 60_000);

  it("claim_check returns isError for a bad image", async () => {
    const r = await client.callTool({
      name: "claim_check",
      arguments: {
        before_scores: scores.baselines[0].scores,
        after_scores: scores.simulated[0].scores,
        before_image: "not-an-image",
        after_image: readFileSync(path.join(root, "public/demo/IMG_1407_1920.jpg")).toString("base64"),
      },
    });
    expect(r.isError).toBe(true);
  }, 60_000);
});

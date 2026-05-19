#!/usr/bin/env node
const { runSeoLandingGeneration } = require("../api/_seo/generator");

function parseArgs(argv) {
  const args = {
    mode: "dry_run",
    limit: 5,
    template_type: "random",
    autoPublish: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run" || arg === "--dry_run") args.mode = "dry_run";
    else if (arg === "--generate") args.mode = "generate";
    else if (arg === "--publish") args.mode = "publish";
    else if (arg === "--auto-publish" || arg === "--autoPublish") args.autoPublish = true;
    else if (arg === "--include-existing-drafts") args.includeExistingDrafts = true;
    else if (arg === "--publish-first-eligible") args.publishFirstEligible = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--limit" && next) {
      args.limit = Number(next);
      index += 1;
    } else if (arg.startsWith("--candidate-limit=")) {
      args.candidateLimit = Number(arg.slice("--candidate-limit=".length));
    } else if (arg === "--candidate-limit" && next) {
      args.candidateLimit = Number(next);
      index += 1;
    } else if (arg.startsWith("--daily-publish-limit=")) {
      args.dailyPublishLimit = arg.endsWith("=none") ? null : Number(arg.slice("--daily-publish-limit=".length));
    } else if (arg === "--daily-publish-limit" && next) {
      args.dailyPublishLimit = next === "none" ? null : Number(next);
      index += 1;
    } else if (arg.startsWith("--max-publishes-per-run=")) {
      args.maxPublishesPerRun = Number(arg.slice("--max-publishes-per-run=".length));
    } else if (arg === "--max-publishes-per-run" && next) {
      args.maxPublishesPerRun = Number(next);
      index += 1;
    } else if (arg.startsWith("--template_type=")) args.template_type = arg.slice("--template_type=".length);
    else if (arg === "--template_type" && next) {
      args.template_type = next;
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      args.mode = arg.slice("--mode=".length);
    } else if (arg === "--mode" && next) {
      args.mode = next;
      index += 1;
    }
  }

  return args;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSeoLandingGeneration(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

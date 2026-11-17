import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postcss from "postcss";

import config from "../postcss.config.mjs";

test("the production PostCSS pipeline compiles a landing utility", async () => {
  const source = fileURLToPath(new URL("../styles/globals.css", import.meta.url));
  const plugins = await Promise.all(
    Object.entries(config.plugins).map(async ([name, options]) => {
      const { default: plugin } = await import(name);
      return plugin(options);
    }),
  );
  const result = await postcss(plugins).process(await readFile(source, "utf8"), {
    from: source,
  });

  let hasFlexUtility = false;
  result.root.walkRules(".flex", (rule) => {
    rule.walkDecls("display", (declaration) => {
      if (declaration.value === "flex") hasFlexUtility = true;
    });
  });
  assert.ok(hasFlexUtility, "the generated stylesheet contains the flex utility");
});

import Bundler from "parcel-bundler";
import { resolve, dirname } from "path";
import svelteBundle, { defaultTemplate as svelteTemplate } from "./svelte";
import reactBundle, { defaultTemplate as reactTemplate } from "./react";
import { existsSync } from "fs";

const defaultTemplateDir = resolve(__dirname, "../../templates");
const defaultTemplates = {
  [templateName(svelteTemplate)]: svelteTemplate,
  [templateName(reactTemplate)]: reactTemplate
};

async function buildBundler(input, { watch, output, template, optimized }) {
  const [entrypoint, outDir] = await buildTemplate(input, {
    watch,
    output,
    template,
    optimized
  });

  const htmlDir = resolve(outDir, "html");
  const cacheDir = resolve(outDir, "cache");

  const options = {
    outDir: htmlDir,
    cacheDir: cacheDir,
    watch: !!watch,
    autoInstall: false,
    sourceMaps: !optimized,
    production: optimized,
    minify: optimized,
    contentHash: optimized
  };

  return new Bundler(entrypoint, options);
}

function detectTemplate(template) {
  if (!template) {
    return svelteTemplate;
  }

  let tplFile = defaultTemplates[template];

  if (!tplFile) {
    tplFile = resolve(process.cwd(), template);
  }

  return tplFile;
}

function templateName(tplPath) {
  return dirname(tplPath.replace(defaultTemplateDir, "")).substr(1);
}

function buildTemplate(input, options) {
  const tplFile = detectTemplate(options.template);

  if (existsSync(resolve(dirname(tplFile), "App.svelte"))) {
    return svelteBundle(input, options);
  }

  return reactBundle(input, options);
}

export async function htmlBundle(input, options) {
  const bundler = await buildBundler(input, options);
  return bundler.bundle();
}

export async function httpBundle(input, options) {
  const bundler = await buildBundler(input, options);

  if (options.ssl) {
    return bundler.serve(
      options.port,
      { cert: options.cert, key: options.key },
      options.host
    );
  }

  return bundler.serve(options.port, false, options.host);
}
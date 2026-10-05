import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const handbookRoot = path.join(repositoryRoot, 'docs', 'handbook');
const outputRoot = path.join(handbookRoot, 'site');
const artifactRoot = path.join(repositoryRoot, 'artifacts', 'documentation');
const manifest = JSON.parse(await readFile(path.join(handbookRoot, 'manifest.json'), 'utf8'));
const chapters = await Promise.all(manifest.chapters.map(async (chapter) => ({
  ...chapter,
  markdown: await readFile(path.join(handbookRoot, chapter.file), 'utf8'),
})));
const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
const revision = getRevision();
const generatedAt = new Date().toISOString();
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
let npmDependencyCatalog = [];

function getRevision() {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return `${commit}${dirty ? '-dirty' : ''}`;
  } catch {
    return 'unknown';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function renderChapter(chapter) {
  const imageRule = markdown.renderer.rules.image;
  markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    const source = token.attrGet('src') ?? '';
    if (!source.startsWith('asset:')) {
      throw new Error(`Use the asset: prefix for handbook images: ${source}`);
    }

    const assetName = path.basename(source.slice('asset:'.length));
    if (!assetName || assetName !== source.slice('asset:'.length)) {
      throw new Error(`Invalid handbook asset path: ${source}`);
    }

    token.attrSet('src', `assets/${assetName}`);
    return imageRule
      ? imageRule(tokens, index, options, environment, renderer)
      : renderer.renderToken(tokens, index, options);
  };

  const rendered = markdown.render(chapter.markdown);
  markdown.renderer.rules.image = imageRule;
  const dependencyAppendix = chapter.id === 'dependencies' ? renderDependencyAppendix() : '';
  return `<article class="chapter" id="${escapeHtml(chapter.id)}" data-chapter="${escapeHtml(chapter.id)}">${rendered}${dependencyAppendix}</article>`;
}

function renderDependencyAppendix() {
  const rows = npmDependencyCatalog.map((dependency) => (
    `<tr><td><code>${escapeHtml(dependency.name)}</code></td><td>${escapeHtml(dependency.version || 'unknown')}</td><td>${escapeHtml(dependency.scope)}</td><td>${escapeHtml(dependency.license || 'not declared in lock entry')}</td></tr>`
  )).join('');
  return `<section class="dependency-appendix"><h2>Locked npm Package Appendix</h2><p>This generated appendix lists exact root and Zentra npm package entries from their lockfiles. Nested duplicate versions remain separate rows. Android Gradle and Rust Cargo graphs are maintained by their native tools and are not included in this table.</p><table><thead><tr><th>Package</th><th>Locked version</th><th>Project/scope</th><th>License metadata</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function collectSchemaCatalog() {
  const schemaModule = require(path.join(repositoryRoot, 'backend', 'core', 'db', 'schema-master.js'));
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(schemaModule.schema);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return tables.map(({ name }) => {
      const escapedName = name.replace(/"/g, '""');
      return {
        name,
        columns: db.pragma(`table_info("${escapedName}")`).map((column) => ({
          name: column.name,
          type: column.type,
          notNull: Boolean(column.notnull),
          defaultValue: column.dflt_value,
          primaryKeyOrder: column.pk,
        })),
        foreignKeys: db.pragma(`foreign_key_list("${escapedName}")`).map((foreignKey) => ({
          column: foreignKey.from,
          referencedTable: foreignKey.table,
          referencedColumn: foreignKey.to,
          onUpdate: foreignKey.on_update,
          onDelete: foreignKey.on_delete,
        })),
        indexes: db.pragma(`index_list("${escapedName}")`).map((index) => ({
          name: index.name,
          unique: Boolean(index.unique),
          origin: index.origin,
        })),
      };
    });
  } finally {
    db.close();
  }
}

function renderSchemaAppendix(schemaTables) {
  const tableSections = schemaTables.map((table) => {
    const columns = table.columns.map((column) => `<tr><td><code>${escapeHtml(column.name)}</code></td><td>${escapeHtml(column.type || 'unspecified')}</td><td>${column.primaryKeyOrder ? `PK ${column.primaryKeyOrder}` : (column.notNull ? 'NOT NULL' : 'nullable')}</td><td>${escapeHtml(column.defaultValue ?? '')}</td></tr>`).join('');
    const foreignKeys = table.foreignKeys.length
      ? `<p><strong>Foreign keys:</strong> ${table.foreignKeys.map((key) => `<code>${escapeHtml(key.column)}</code> to <code>${escapeHtml(key.referencedTable)}.${escapeHtml(key.referencedColumn)}</code> (delete ${escapeHtml(key.onDelete)})`).join('; ')}</p>`
      : '<p><strong>Foreign keys:</strong> none declared</p>';
    const indexes = table.indexes.length
      ? `<p><strong>Indexes:</strong> ${table.indexes.map((index) => `<code>${escapeHtml(index.name)}</code>${index.unique ? ' (unique)' : ''}`).join(', ')}</p>`
      : '<p><strong>Indexes:</strong> none declared</p>';
    return `<section class="schema-table-section"><h3>${escapeHtml(table.name)}</h3><table><thead><tr><th>Column</th><th>Declared type</th><th>Constraint</th><th>Default</th></tr></thead><tbody>${columns}</tbody></table>${foreignKeys}${indexes}</section>`;
  }).join('');
  return `<article class="chapter generated-appendix" id="schema-catalog" data-generated="schema-catalog"><h1>Generated SQLite Schema Catalog</h1><p>Generated by opening <code>backend/core/db/schema-master.js</code> in an isolated in-memory SQLite database and querying SQLite metadata. This describes master schema declarations only; startup repair, migrations, legacy data, and deployed schema may differ.</p><p>Table count: ${schemaTables.length}. Use the migration manager and production-approved schema inspection for runtime truth.</p>${tableSections}</article>`;
}

function buildHtml(schemaTables) {
  const navigation = chapters.map((chapter) => (
    `<a data-nav="${escapeHtml(chapter.id)}" href="#${escapeHtml(chapter.id)}">${escapeHtml(chapter.title)}</a>`
  )).join('\n');
  const content = chapters.map(renderChapter).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Verified engineering, development, and operations handbook for the MacOS Business Suite.">
  <title>${escapeHtml(manifest.title)}</title>
  <link rel="stylesheet" href="./theme.css">
</head>
<body>
  <aside class="rail" aria-label="Handbook navigation">
    <a class="brand" href="#top"><span class="brand-mark">M</span><span>ENGINEERING<br>HANDBOOK</span></a>
    <nav>${navigation}</nav>
    <p class="rail-meta">Revision ${escapeHtml(revision)}<br>${escapeHtml(generatedAt.slice(0, 10))}</p>
  </aside>
  <main id="top">
    <header class="cover">
      <p class="eyebrow">MACOS BUSINESS SUITE / TECHNICAL REFERENCE</p>
      <h1 id="volume-title">${escapeHtml(manifest.title)}</h1>
      <p class="cover-deck">A practical map from local toolchain to production handoff, across five application surfaces.</p>
      <div class="cover-meta"><span>REV ${escapeHtml(revision)}</span><span>GENERATED ${escapeHtml(generatedAt)}</span><span>DOCS ${escapeHtml(manifest.version)}</span></div>
      <p id="volume-description" class="cover-note">${escapeHtml(manifest.description)}</p>
    </header>
    <section class="contents" aria-labelledby="contents-title">
      <p class="eyebrow">READING MAP</p><h2 id="contents-title">In this handbook</h2>
      <ol>${chapters.map((chapter) => `<li data-toc="${escapeHtml(chapter.id)}"><a href="#${escapeHtml(chapter.id)}"><span>${escapeHtml(chapter.title)}</span><span class="toc-arrow">&#8599;</span></a></li>`).join('')}<li data-toc="schema-catalog"><a href="#schema-catalog"><span>Generated SQLite Schema Catalog</span><span class="toc-arrow">&#8599;</span></a></li></ol>
    </section>
    ${content}
    ${renderSchemaAppendix(schemaTables)}
    <footer class="document-footer"><span>${escapeHtml(manifest.title)}</span><span>Revision ${escapeHtml(revision)}</span></footer>
  </main>
  <script src="./site.js"></script>
</body>
</html>`;
}

async function collectInventory() {
  const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const zentraPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'zentra-analytics-dashboard', 'package.json'), 'utf8'));
  const lockfiles = await Promise.all([
    ['package-lock.json', 'package.json'],
    ['zentra-analytics-dashboard/package-lock.json', 'zentra-analytics-dashboard/package.json'],
  ].map(async ([lockPath, manifestPath]) => {
    const lock = JSON.parse(await readFile(path.join(repositoryRoot, lockPath), 'utf8'));
    const rootMetadata = lock.packages?.[''] ?? {};
    const productionDependencies = rootMetadata.dependencies ?? {};
    const developmentDependencies = rootMetadata.devDependencies ?? {};
    return {
      source: lockPath,
      manifest: manifestPath,
      lockfileVersion: lock.lockfileVersion,
      packages: Object.entries(lock.packages ?? {}).map(([installPath, metadata]) => {
        const packageName = packageNameFromInstallPath(installPath);
        const declaredDirectly = installPath === `node_modules/${packageName}` && (
          Object.hasOwn(productionDependencies, packageName) || Object.hasOwn(developmentDependencies, packageName)
        );
        return {
          installPath,
          version: metadata.version ?? null,
          dev: metadata.dev ?? false,
          optional: metadata.optional ?? false,
          license: metadata.license ?? null,
          declaredDirectly,
        };
      }),
    };
  }));

  return {
    generatedAt,
    revision,
    packages: [
      {
        name: rootPackage.name,
        version: rootPackage.version,
        engines: rootPackage.engines,
        scripts: rootPackage.scripts,
        dependencies: rootPackage.dependencies,
        devDependencies: rootPackage.devDependencies,
        source: 'package.json',
      },
      {
        name: zentraPackage.name,
        version: zentraPackage.version,
        scripts: zentraPackage.scripts,
        dependencies: zentraPackage.dependencies,
        devDependencies: zentraPackage.devDependencies,
        source: 'zentra-analytics-dashboard/package.json',
      },
    ],
    lockfiles,
    otherDependencySources: [
      'android/gradle/libs.versions.toml',
      'shared/suite_core/Cargo.toml',
      'shared/suite_core/Cargo.lock',
    ],
  };
}

function packageNameFromInstallPath(installPath) {
  const marker = installPath.lastIndexOf('node_modules/');
  const packagePath = marker >= 0 ? installPath.slice(marker + 'node_modules/'.length) : installPath;
  const parts = packagePath.split('/');
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function validateManifest() {
  const ids = new Set();
  for (const chapter of chapters) {
    if (!chapter.id || ids.has(chapter.id)) throw new Error(`Duplicate or missing chapter id: ${chapter.id}`);
    ids.add(chapter.id);
  }
  for (const volume of manifest.volumes) {
    for (const chapterId of volume.chapters) {
      if (chapterId !== 'schema-catalog' && !chapterById.has(chapterId)) throw new Error(`Unknown chapter ${chapterId} in volume ${volume.id}`);
    }
  }
}

async function listMarkdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(entryPath));
    } else if (path.extname(entry.name).toLowerCase() === '.md') {
      files.push(entryPath);
    }
  }
  return files;
}

function sourceOwner(filePath) {
  const parts = filePath.split('/');
  if (parts[0] === 'frontend' && parts[1] === 'modules') return `MacOS web / ${parts[2] ?? 'modules'}`;
  if (parts[0] === 'backend' && parts[1] === 'departments') return `Backend department / ${parts[2] ?? 'registry'}`;
  if (parts[0] === 'backend') return `Node backend / ${parts[1] ?? 'shared'}`;
  if (parts[0] === 'android') return `Android / ${parts[1] ?? 'project'}`;
  if (parts[0] === 'shared' && parts[1] === 'suite_core') return `Rust core / ${parts[2] ?? 'crate'}`;
  if (parts[0] === 'zentra-analytics-dashboard') return `Zentra / ${parts[1] ?? 'project'}`;
  if (parts[0] === 'docs') return `Documentation / ${parts[1] ?? 'index'}`;
  if (parts[0] === 'tools') return `Tooling / ${parts[1] ?? 'scripts'}`;
  if (parts[0] === 'deploy') return `Deployment / ${parts[1] ?? 'scripts'}`;
  return `Workspace / ${parts[0]}`;
}

async function generateSourceCatalog() {
  const trackedPaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).split(/\r?\n/).filter(Boolean);
  const outputPath = path.join(repositoryRoot, 'docs', 'ai-reference', '05-source-catalog.md');
  const allowedExtensions = new Set(['.c', '.cc', '.cpp', '.css', '.gradle', '.html', '.java', '.js', '.json', '.jsx', '.kt', '.kts', '.md', '.mjs', '.ps1', '.py', '.rs', '.scss', '.sh', '.sql', '.toml', '.ts', '.tsx', '.xml', '.yaml', '.yml']);
  const paths = trackedPaths
    .filter((filePath) => allowedExtensions.has(path.extname(filePath).toLowerCase()))
    .filter((filePath) => !filePath.startsWith('docs/handbook/site/'))
    .filter((filePath) => filePath !== 'docs/ai-reference/05-source-catalog.md')
    .sort((left, right) => left.localeCompare(right));
  const rows = paths.map((filePath) => `| \`${filePath}\` | ${sourceOwner(filePath)} | ${path.extname(filePath) || 'no extension'} |`);
  const content = [
    '# Generated Source Catalog',
    '',
    '> Generated by `npm run docs:build` from tracked and non-ignored workspace paths. This is a discovery map, not a code summary or evidence that a file is active at runtime.',
    '',
    '| Source path | Ownership hint | File type |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  await writeFile(outputPath, content, 'utf8');
  return paths.length;
}

async function validateAiReference() {
  const indexPath = path.join(repositoryRoot, 'docs', 'AI-INDEX.md');
  const referenceDirectory = path.join(repositoryRoot, 'docs', 'ai-reference');
  const files = [indexPath, ...await listMarkdownFiles(referenceDirectory)];
  let lineCount = 0;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    lineCount += source.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }

  if (lineCount < 1000) {
    throw new Error(`AI reference set must contain 1,000-2,000 nonblank lines; found ${lineCount}.`);
  }
  if (lineCount > 2000) {
    throw new Error(`AI reference set must contain 1,000-2,000 nonblank lines; found ${lineCount}.`);
  }

  console.log(`Validated AI reference set: ${lineCount} nonblank lines`);
  return lineCount;
}

async function main() {
  validateManifest();
  const catalogedSources = await generateSourceCatalog();
  const aiReferenceLines = await validateAiReference();
  const schemaTables = collectSchemaCatalog();
  await mkdir(path.join(outputRoot, 'assets'), { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  await copyFile(path.join(handbookRoot, 'theme.css'), path.join(outputRoot, 'theme.css'));
  await copyFile(path.join(handbookRoot, 'site.js'), path.join(outputRoot, 'site.js'));

  const assetDirectory = path.join(handbookRoot, 'assets');
  for (const asset of await readdir(assetDirectory)) {
    await copyFile(path.join(assetDirectory, asset), path.join(outputRoot, 'assets', asset));
  }

  const inventory = await collectInventory();
  npmDependencyCatalog = inventory.lockfiles.flatMap((lockfile) => lockfile.packages
    .filter((dependency) => dependency.installPath.startsWith('node_modules/'))
    .map((dependency) => ({
      name: packageNameFromInstallPath(dependency.installPath),
      version: dependency.version,
      scope: `${lockfile.manifest} / ${dependency.declaredDirectly ? (dependency.dev ? 'direct development' : 'direct runtime') : (dependency.dev ? 'transitive development' : 'transitive runtime')}${dependency.optional ? ' / optional' : ''}`,
      license: dependency.license,
    })));
  await writeFile(path.join(outputRoot, 'schema-catalog.json'), `${JSON.stringify({ generatedAt, revision, source: 'backend/core/db/schema-master.js', tables: schemaTables }, null, 2)}\n`, 'utf8');
  const htmlPath = path.join(outputRoot, 'index.html');
  await writeFile(htmlPath, buildHtml(schemaTables), 'utf8');
  await writeFile(path.join(outputRoot, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');

  const browser = await puppeteer.launch({
    headless: true,
    args: process.env.CI === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');

    const pdfs = [
      { id: 'complete-handbook', title: manifest.title, description: manifest.description, chapters: [...chapters.map(({ id }) => id), 'schema-catalog'] },
      ...manifest.volumes,
    ];

    const pdfPages = {};
    for (const volume of pdfs) {
      await page.evaluate(({ title, description, selected }) => {
        document.title = title;
        document.querySelector('#volume-title').textContent = title;
        document.querySelector('#volume-description').textContent = description ?? '';
        document.querySelectorAll('[data-chapter]').forEach((element) => {
          element.hidden = !selected.includes(element.dataset.chapter);
        });
        document.querySelectorAll('[data-toc]').forEach((element) => {
          element.hidden = !selected.includes(element.dataset.toc);
        });
        document.querySelectorAll('[data-nav]').forEach((element) => {
          element.hidden = !selected.includes(element.dataset.nav);
        });
        document.querySelectorAll('[data-generated]').forEach((element) => {
          element.hidden = !selected.includes(element.dataset.generated);
        });
      }, { title: volume.title, description: volume.description, selected: volume.chapters });

      const pdfPath = path.join(artifactRoot, `${volume.id}.pdf`);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="font:8px Arial;color:#52635d;width:100%;padding:0 14mm"><span>MACOS BUSINESS SUITE / ENGINEERING HANDBOOK</span></div>',
        footerTemplate: '<div style="font:8px Arial;color:#52635d;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>INTERNAL TECHNICAL REFERENCE</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
        margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
      });
      const pdfContent = (await readFile(pdfPath)).toString('latin1');
      const pageCount = (pdfContent.match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length;
      pdfPages[volume.id] = pageCount;
      if (pageCount === 0) throw new Error(`Generated PDF has no page objects: ${volume.id}`);
      if (volume.id === 'complete-handbook' && pageCount > manifest.targetMasterPages.maximum) {
        throw new Error(`Master PDF exceeds ${manifest.targetMasterPages.maximum} pages: ${pageCount}`);
      }
      console.log(`Created ${path.relative(repositoryRoot, pdfPath)}`);
    }

    const chapterWordCount = chapters.reduce((total, chapter) => (
      total + (chapter.markdown.match(/[A-Za-z0-9][A-Za-z0-9._+:/-]*/g) ?? []).length
    ), 0);
    const screenshotPlaceholderCount = chapters.reduce((total, chapter) => (
      total + (chapter.markdown.match(/asset:screenshot-placeholder\.svg/g) ?? []).length
    ), 0);
    const masterPages = pdfPages['complete-handbook'];
    const metrics = {
      generatedAt,
      revision,
      status: masterPages >= manifest.targetMasterPages.minimum ? 'page-target-reached' : 'in-progress',
      targetMasterPages: manifest.targetMasterPages,
      masterPdfPages: masterPages,
      volumePdfPages: Object.fromEntries(Object.entries(pdfPages).filter(([id]) => id !== 'complete-handbook')),
      chapterCount: chapters.length,
      chapterWordCount,
      aiReferenceNonblankLines: aiReferenceLines,
      indexedSourceFiles: catalogedSources,
      screenshotPlaceholders: screenshotPlaceholderCount,
      schemaTableCount: schemaTables.length,
      schemaColumnCount: schemaTables.reduce((total, table) => total + table.columns.length, 0),
    };
    const metricsPath = path.join(artifactRoot, 'handbook-metrics.json');
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
    console.log(`Master page progress: ${masterPages}/${manifest.targetMasterPages.minimum}-${manifest.targetMasterPages.maximum} pages`);
    console.log(`Created ${path.relative(repositoryRoot, metricsPath)}`);
  } finally {
    await browser.close();
  }

  console.log(`Created ${path.relative(repositoryRoot, htmlPath)}`);
  console.log(`Created ${path.relative(repositoryRoot, path.join(outputRoot, 'inventory.json'))}`);
  console.log(`Indexed ${catalogedSources} source files in docs/ai-reference/05-source-catalog.md`);
}

await main();
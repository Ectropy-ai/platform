import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import yaml from 'js-yaml';

const root = process.cwd();
const distDir = path.join(root, 'dist', 'extracted');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function outPath(relative: string): string {
  const rel = relative.replace(/\.[^.]+$/, '.json');
  const full = path.join(distDir, rel);
  ensureDir(path.dirname(full));
  return full;
}

function getJsDoc(node: ts.Node): string | undefined {
  const jsDoc = (node as any).jsDoc;
  if (!jsDoc) {
    return undefined;
  }
  return jsDoc.map((d: any) => d.comment || '').join('\n').trim() || undefined;
}

interface ExportInfo {
  name: string;
  kind: string;
  jsDoc?: string;
}

interface RouteInfo {
  method: string;
  path: string;
}

function extractExportsAndRoutes(file: string): { exports: ExportInfo[]; routes: RouteInfo[] } {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const exports: ExportInfo[] = [];
  const routes: RouteInfo[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isVariableStatement(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      const kind = ts.SyntaxKind[node.kind];
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((decl) => {
          const name = decl.name.getText();
          exports.push({ name, kind, jsDoc: getJsDoc(node) });
        });
      } else if ((node as any).name) {
        const name = (node as any).name.text;
        exports.push({ name, kind, jsDoc: getJsDoc(node) });
      }
    }
    if (ts.isExportAssignment(node)) {
      exports.push({ name: 'default', kind: 'exportAssignment', jsDoc: getJsDoc(node) });
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const obj = node.expression.expression.getText();
      const method = node.expression.name.getText();
      const routeMethods = ['get', 'post', 'put', 'delete', 'patch', 'options'];
      if (['router', 'app'].includes(obj) && routeMethods.includes(method)) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) {
          routes.push({ method, path: (arg as any).text });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return { exports, routes };
}

async function listFiles(dir: string, exts: string[]): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(res, exts)));
    } else if (exts.some((e) => res.endsWith(e))) {
      files.push(res);
    }
  }
  return files;
}

async function processApps(): Promise<void> {
  if (!fs.existsSync('apps')) {
    return;
  }
  const files = await listFiles('apps', ['.ts', '.js']);
  for (const file of files) {
    const { exports, routes } = extractExportsAndRoutes(file);
    const rel = path.relative(root, file);
    const out = outPath(rel);
    const data = { file: rel, exports, routes };
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
  }
}

interface TableColumn {
  name: string;
  type: string;
}

interface TableInfo {
  name: string;
  columns: TableColumn[];
}

function extractTables(sql: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const regex = /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;
  while ((match = regex.exec(sql))) {
    const [, tableName, body] = match;
    const columns: TableColumn[] = [];
    body
      .split(/,\n?/)
      .map((line) => line.trim())
      .forEach((line) => {
        const colMatch = line.match(/^"?(\w+)"?\s+([\w()]+)/);
        if (colMatch) {
          columns.push({ name: colMatch[1], type: colMatch[2] });
        }
      });
    tables.push({ name: tableName, columns });
  }
  return tables;
}

async function processSql(): Promise<void> {
  if (!fs.existsSync('database')) {
    return;
  }
  const files = await listFiles('database', ['.sql']);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const tables = extractTables(content);
    const rel = path.relative(root, file);
    const out = outPath(rel);
    const data = { file: rel, tables };
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
  }
}

async function processConfigs(): Promise<void> {
  const rootEntries = await fs.promises.readdir('.');
  const compose = rootEntries.filter((f) => f.startsWith('docker-compose') && f.endsWith('.yml'));
  for (const file of compose) {
    const content = fs.readFileSync(file, 'utf8');
    const config = yaml.load(content);
    const out = outPath(file);
    fs.writeFileSync(out, JSON.stringify({ file, config }, null, 2));
  }
  const nxPath = 'nx.json';
  if (fs.existsSync(nxPath)) {
    const config = JSON.parse(fs.readFileSync(nxPath, 'utf8'));
    const out = outPath(nxPath);
    fs.writeFileSync(out, JSON.stringify({ file: nxPath, config }, null, 2));
  }
}

async function run(): Promise<void> {
  ensureDir(distDir);
  await processApps();
  await processSql();
  await processConfigs();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
import path from 'node:path';
import ts from 'typescript';

const privacyPath = 'app/privacy/page.tsx';
const storageNames = new Set(['localStorage', 'sessionStorage']);
const storageMethods = new Set(['getItem', 'setItem', 'removeItem']);
const browserGlobals = new Set(['window', 'globalThis', 'self']);
const cookieStoreNames = new Set(['cookieStore']);
const trackerNames = new Set(['umami']);
const headerMethods = new Set(['get', 'set', 'append', 'delete', 'has', 'getSetCookie']);
const eventAttribute = 'data-umami-event';

export function* nodes(node: ts.Node): Generator<ts.Node> {
  yield node;
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => { children.push(child); });
  for (const child of children) yield* nodes(child);
}

export function location(node: ts.Node): string {
  const source = node.getSourceFile();
  const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  return `${source.fileName.slice(1)}:${line}`;
}

export function sourceProgram(sources: ReadonlyMap<string, string>): ts.Program {
  const files = new Map([...sources].map(([filename, text]) => [
    '/' + filename, ts.createSourceFile('/' + filename, text, ts.ScriptTarget.Latest, true),
  ]));
  const directories = new Set(['/']);
  for (const filename of files.keys()) {
    for (let directory = path.posix.dirname(filename); directory !== '/'; directory = path.posix.dirname(directory)) {
      directories.add(directory);
    }
  }
  const options: ts.CompilerOptions = {
    allowJs: true, noLib: true, jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: '/', paths: { '@/*': ['./*'] },
  };
  // The checker supplies lexical and import bindings using only the scanned sources.
  return ts.createProgram([...files.keys()], options, {
    getSourceFile: (filename) => files.get(filename),
    getDefaultLibFileName: () => '/lib.d.ts',
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (filename) => filename,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (filename) => files.has(filename),
    directoryExists: (directory) => directories.has(directory),
    readFile: (filename) => sources.get(filename.slice(1)),
    writeFile: () => {},
  });
}

function unwrap(expression: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function stringLiteral(node: ts.Node | undefined): string | undefined {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function importedBinding(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): ts.Symbol | undefined {
  return symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
}

function constInitializer(expression: ts.Identifier, checker: ts.TypeChecker): ts.Expression | undefined {
  const symbol = importedBinding(checker.getSymbolAtLocation(expression), checker);
  const declaration = symbol?.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent)
    || !(declaration.parent.flags & ts.NodeFlags.Const)) return undefined;
  return declaration.initializer;
}

export function constantExpression(
  expression: ts.Expression, checker: ts.TypeChecker, seen = new Set<ts.Expression>(),
): ts.Expression | undefined {
  expression = unwrap(expression);
  if (!ts.isIdentifier(expression)) return expression;
  const initializer = constInitializer(expression, checker);
  if (!initializer || seen.has(initializer)) return undefined;
  seen.add(initializer);
  return constantExpression(initializer, checker, seen);
}

export function staticString(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  return stringLiteral(constantExpression(expression, checker));
}

function access(node: ts.Node): { receiver: ts.Expression; name: string | undefined } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { receiver: node.expression, name: node.name.text };
  if (ts.isElementAccessExpression(node)) {
    return { receiver: node.expression, name: stringLiteral(node.argumentExpression) };
  }
  return undefined;
}

function identifier(node: ts.Node): string | undefined {
  return ts.isIdentifier(node) ? node.text : undefined;
}

function literalProperty(node: ts.Node): string | undefined {
  return identifier(node) ?? stringLiteral(node);
}

function bareReference(node: ts.Node): string | undefined {
  if (!ts.isIdentifier(node)) return undefined;
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)
    || ts.isBindingElement(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent))
    && parent.name === node) return undefined;
  return node.text;
}

function globalReference(node: ts.Node, names: ReadonlySet<string>, checker: ts.TypeChecker): string | undefined {
  const bare = bareReference(node);
  if (bare && names.has(bare) && !checker.getSymbolAtLocation(node)) return bare;
  const member = access(node);
  if (member?.name && names.has(member.name) && browserGlobals.has(identifier(member.receiver) ?? '')) {
    return member.name;
  }
  return undefined;
}

function receiverMethod(reference: ts.Node): { call: ts.CallExpression; name: string } | undefined {
  const method = reference.parent;
  const member = access(method);
  if (member?.receiver === reference && member.name && ts.isCallExpression(method.parent)
    && method.parent.expression === method) return { call: method.parent, name: member.name };
  return undefined;
}

function cookieReference(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (globalReference(node, cookieStoreNames, checker)) return true;
  const member = access(node);
  if (member && (member.name === 'cookies' || (member.name === 'cookie' && identifier(member.receiver) === 'document'))) {
    return true;
  }
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    if (identifier(callee) === 'cookies') return true;
    const symbol = checker.getSymbolAtLocation(callee);
    if (symbol?.declarations?.some((declaration) => ts.isImportSpecifier(declaration)
      && (declaration.propertyName ?? declaration.name).text === 'cookies'
      && stringLiteral(declaration.parent.parent.parent.moduleSpecifier) === 'next/headers')) return true;
    const method = access(callee);
    if (!method || !headerMethods.has(method.name ?? '')) return false;
    const receiverName = identifier(method.receiver) ?? access(method.receiver)?.name;
    return !!receiverName && /headers$/i.test(receiverName)
      && (method.name === 'getSetCookie' || cookieHeader(stringLiteral(node.arguments[0])));
  }
  if (ts.isPropertyAssignment(node)) {
    return cookieHeader(literalProperty(node.name)) && isHeaderInitializer(node.parent);
  }
  if (!ts.isStringLiteralLike(node) || !cookieHeader(node.text)) return false;
  const parent = node.parent;
  return (ts.isPropertyAssignment(parent) && parent.initializer === node && literalProperty(parent.name) === 'key')
    || (ts.isArrayLiteralExpression(parent) && parent.elements[0] === node
      && ts.isArrayLiteralExpression(parent.parent) && isHeaderInitializer(parent.parent));
}

function isHeaderInitializer(node: ts.Expression): boolean {
  const parent = node.parent;
  return (ts.isNewExpression(parent) && identifier(parent.expression) === 'Headers')
    || (ts.isPropertyAssignment(parent) && literalProperty(parent.name) === 'headers');
}

function cookieHeader(value: string | undefined): boolean {
  return /^(?:set-)?cookie$/i.test(value ?? '');
}

export function jsxTag(node: ts.Node): string | undefined {
  if (ts.isJsxElement(node)) return identifier(node.openingElement.tagName);
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) return identifier(node.tagName);
  return undefined;
}

export function jsxAttribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && identifier(attribute.name) === name);
}

export function attributeValue(attribute: ts.JsxAttribute | undefined): ts.Expression | undefined {
  const value = attribute?.initializer;
  return value && (ts.isJsxExpression(value) ? value.expression : ts.isStringLiteral(value) ? value : undefined);
}

function inlineScript(node: ts.JsxOpeningLikeElement): ts.Expression | undefined {
  const html = attributeValue(jsxAttribute(node, 'dangerouslySetInnerHTML'));
  if (!html || !ts.isObjectLiteralExpression(html)) return undefined;
  const field = html.properties.find((prop): prop is ts.PropertyAssignment =>
    ts.isPropertyAssignment(prop) && literalProperty(prop.name) === '__html');
  return field?.initializer;
}

export function jsxText(node: ts.JsxElement): string {
  return node.children.map((child) => {
    if (ts.isJsxText(child)) return child.text;
    if (ts.isJsxElement(child)) return jsxText(child);
    return ts.isJsxExpression(child) ? stringLiteral(child.expression) ?? '' : '';
  }).join('').replace(/\s+/g, ' ').trim();
}

export function codeEntries(node: ts.Node): Map<string, ts.JsxElement> {
  return new Map([...nodes(node)].filter((child): child is ts.JsxElement =>
    ts.isJsxElement(child) && jsxTag(child) === 'code').map((child) => [jsxText(child), child]));
}

interface ScriptPart {
  text: string;
  node: ts.Node;
  insideLiteral?: boolean;
}

function scriptInterpolation(expression: ts.Expression, checker: ts.TypeChecker): ScriptPart | undefined {
  const literal = staticString(expression, checker);
  if (literal !== undefined) return { text: literal, node: expression };
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return undefined;
  const member = access(expression.expression);
  if (!member || identifier(member.receiver) !== 'JSON' || member.name !== 'stringify') return undefined;
  const argument = unwrap(expression.arguments[0]);
  const value = unwrap(ts.isIdentifier(argument) ? constInitializer(argument, checker) ?? argument : argument);
  if (!ts.isArrayLiteralExpression(value)) return undefined;
  const entries = value.elements.map((entry) => staticString(entry, checker));
  return entries.every((entry) => entry !== undefined) ? { text: JSON.stringify(entries), node: value } : undefined;
}

function scriptParts(
  expression: ts.Expression, checker: ts.TypeChecker, seen = new Set<ts.Expression>(),
): ScriptPart[] | undefined {
  expression = unwrap(expression);
  if (ts.isStringLiteralLike(expression)) return [{ text: expression.text, node: expression, insideLiteral: true }];
  if (ts.isIdentifier(expression)) {
    const value = constInitializer(expression, checker);
    if (!value || seen.has(value)) return undefined;
    return scriptParts(value, checker, new Set(seen).add(value));
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = scriptParts(expression.left, checker, seen);
    const right = scriptParts(expression.right, checker, seen);
    return left && right ? [...left, ...right] : undefined;
  }
  if (!ts.isTemplateExpression(expression)) return undefined;
  const parts: ScriptPart[] = [{ text: expression.head.text, node: expression.head, insideLiteral: true }];
  for (const span of expression.templateSpans) {
    const value = scriptInterpolation(span.expression, checker);
    if (!value) return undefined;
    parts.push(value, { text: span.literal.text, node: span.literal, insideLiteral: true });
  }
  return parts;
}

function scriptLocation(parts: ScriptPart[], node: ts.Node): string {
  let offset = node.getStart();
  for (const part of parts) {
    if (offset < part.text.length) {
      const source = part.node.getSourceFile();
      const firstLine = source.getLineAndCharacterOfPosition(part.node.getStart()).line + 1;
      const extraLines = part.insideLiteral ? part.text.slice(0, offset).split('\n').length - 1 : 0;
      return `${source.fileName.slice(1)}:${firstLine + extraLines}`;
    }
    offset -= part.text.length;
  }
  return location(parts.at(-1)!.node);
}

export function parseInlineScript(node: ts.JsxOpeningLikeElement, checker: ts.TypeChecker) {
  const expression = inlineScript(node);
  const parts = expression && scriptParts(expression, checker);
  if (!parts) return undefined;
  const source = ts.createSourceFile('inline.js', parts.map((part) => part.text).join(''), ts.ScriptTarget.Latest, true);
  return { source, location: (child: ts.Node) => scriptLocation(parts, child) };
}

export function checkPrivacyDrift(sources: ReadonlyMap<string, string>) {
  const issues: string[] = [];
  const storageKeys = new Set<string>();
  const events = new Map<string, Set<string>>();
  const program = sourceProgram(sources);
  const checker = program.getTypeChecker();
  const privacy = program.getSourceFile('/' + privacyPath);
  if (!privacy) return { issues: [`${privacyPath}:1: missing privacy page`], storageKeys, events };
  const documentedKeys = new Map([...nodes(privacy)].filter((node): node is ts.JsxElement =>
    ts.isJsxElement(node) && jsxTag(node) === 'code' && !!jsxAttribute(node.openingElement, 'data-storage-key'))
    .map((node) => [jsxText(node), node]));
  const paragraphs = [...nodes(privacy)].filter((node): node is ts.JsxElement =>
    ts.isJsxElement(node) && jsxTag(node) === 'p');
  const analytics = paragraphs.find((node) => jsxText(node).includes('one custom browser event'));
  const [eventName, eventField] = analytics ? codeEntries(analytics).keys() : [];
  if (!eventName || !eventField) issues.push(`${location(analytics ?? privacy)}: missing documented browser event name or field`);
  for (const [topic, wording] of [['session storage', 'uses no session storage'], ['cookies', 'sets no cookies and reads none']]) {
    if (paragraphs.some((node) => jsxText(node).includes(wording))) continue;
    const near = paragraphs.find((node) => jsxText(node).includes(topic));
    issues.push(`${location(near ?? privacy)}: missing statement about ${topic}`);
  }

  type Reporter = (node: ts.Node, message: string) => void;

  function checkEvent(name: ts.Expression, fields: Map<string, ts.Node>, report: Reporter) {
    const event = staticString(name, checker);
    if (event === undefined) {
      report(name, 'event name must be a literal or an immutable const with a literal value');
      return;
    }
    events.set(event, new Set([...(events.get(event) ?? []), ...fields.keys()]));
    if (event !== eventName) report(name, `event ${event} is not documented on /privacy`);
    if (event === eventName && eventField && !fields.has(eventField)) {
      report(name, `event ${event} is missing documented field ${eventField}`);
    }
    for (const [field, node] of fields) {
      if (field !== eventField) report(node, `event field ${field} is not documented on /privacy`);
    }
  }

  function checkTracker(node: ts.Node, report: Reporter) {
    const method = receiverMethod(node);
    if (method?.name !== 'track') {
      report(node, 'use a direct umami.track call so the event and its fields can be checked');
      return;
    }
    if (method.call.arguments.length !== 2) {
      report(method.call, 'umami.track needs two arguments: event name and event data');
      return;
    }
    const [name, value] = method.call.arguments;
    const data = unwrap(value);
    if (!ts.isObjectLiteralExpression(data)) {
      report(value, 'umami.track data must be an inline object');
      return;
    }
    const fields = new Map<string, ts.Node>();
    for (const property of data.properties) {
      const field = (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
        && literalProperty(property.name);
      if (field) fields.set(field, property);
      else report(property, 'umami.track data must use named properties without spreads, computed names or methods');
    }
    checkEvent(name, fields, report);
  }

  function checkEventAttributes(node: ts.JsxOpeningLikeElement, report: Reporter) {
    const event = jsxAttribute(node, eventAttribute);
    const fields = new Map<string, ts.Node>();
    for (const attribute of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        if (event) report(attribute, 'spread can change the declared analytics event or its fields');
        continue;
      }
      const name = identifier(attribute.name);
      if (name?.startsWith(eventAttribute + '-')) fields.set(name.slice(eventAttribute.length + 1), attribute);
    }
    if (!event && !fields.size) return;
    const name = attributeValue(event);
    if (name) checkEvent(name, fields, report);
    else report(event ?? fields.values().next().value!, 'analytics attributes need a data-umami-event value');
  }

  function checkStorage(node: ts.Node, storage: string, report: Reporter) {
    if (storage === 'sessionStorage') report(node, 'sessionStorage is used, but /privacy says there is no session storage');
    const method = receiverMethod(node);
    const parent = node.parent;
    // The inline opt-out hook checks that storage exists before reading it.
    if (!method && ts.isBinaryExpression(parent) && parent.left === node
      && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return;
    const argument = method?.call.arguments[0];
    if (!method || !storageMethods.has(method.name) || !argument) {
      report(node, `use direct ${storage}.getItem/setItem/removeItem with a static key`);
      return;
    }
    const key = staticString(argument, checker);
    if (key === undefined) {
      report(argument, `${storage} key must be a literal or an immutable const with a literal value`);
      return;
    }
    storageKeys.add(key);
    if (!documentedKeys.has(key)) report(argument, `storage key ${key} is not documented on /privacy`);
    if (key === 'umami:disabled' && method.name !== 'getItem') {
      report(node, '/privacy describes the browser opt-out key as read-only to site code');
    }
  }

  function visit(node: ts.Node, report: Reporter) {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isImportDeclaration(node)) return;
    const store = globalReference(node, storageNames, checker);
    if (store) checkStorage(node, store, report);
    if (cookieReference(node, checker)) report(node, 'cookie access disagrees with /privacy');
    if (globalReference(node, trackerNames, checker)) checkTracker(node, report);
    if (ts.isBindingElement(node) && ts.isVariableDeclaration(node.parent.parent)) {
      const name = literalProperty(node.propertyName ?? node.name);
      const initializer = node.parent.parent.initializer;
      if (initializer && browserGlobals.has(identifier(unwrap(initializer)) ?? '')) {
        if (name === 'umami') checkTracker(node, report);
        if (name && storageNames.has(name)) checkStorage(node, name, report);
        if (name === 'cookieStore') report(node, 'cookie access disagrees with /privacy');
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      checkEventAttributes(node, report);
      if (jsxTag(node) === 'script' && stringLiteral(attributeValue(jsxAttribute(node, 'type'))) !== 'application/ld+json') {
        const html = jsxAttribute(node, 'dangerouslySetInnerHTML');
        const script = parseInlineScript(node, checker);
        if (script) {
          visit(script.source, (child, message) => issues.push(`${script.location(child)}: ${message}`));
        } else if (html) report(html, 'inline script must be a static string for the privacy check');
      }
    }
    ts.forEachChild(node, (child) => visit(child, report));
  }

  for (const file of program.getSourceFiles()) {
    visit(file, (node, message) => issues.push(`${location(node)}: ${message}`));
  }
  for (const [key, node] of documentedKeys) {
    if (!storageKeys.has(key)) issues.push(`${location(node)}: documented storage key ${key} is unused`);
  }
  return { issues, storageKeys, events };
}

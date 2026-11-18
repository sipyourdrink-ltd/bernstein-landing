import ts from 'typescript';

import {
  attributeValue, codeEntries, constantExpression, jsxAttribute, jsxTag, jsxText,
  location, nodes, parseInlineScript, sourceProgram, staticString,
} from './privacy-drift.ts';

const privacyPath = 'app/privacy/page.tsx';
const layoutPath = 'app/layout.tsx';
const configPath = 'next.config.mjs';
const humansPath = 'app/humans.txt/route.ts';

function field(object: ts.Expression | undefined, name: string): ts.Expression | undefined {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  for (const property of object.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      && property.name.text === name) return property.initializer;
  }
  return undefined;
}

function compact(node: ts.Node | undefined): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, node?.getText() ?? '');
  let code = '';
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) code += scanner.getTokenText();
  return code;
}

function dropsRequest(statement: ts.Statement): boolean {
  const first = ts.isBlock(statement) ? statement.statements[0] : statement;
  return !!first && ts.isReturnStatement(first) && first.expression?.kind === ts.SyntaxKind.NullKeyword;
}

type InlineScript = NonNullable<ReturnType<typeof parseInlineScript>>;

function checkCleaner(script: InlineScript, callback: ts.FunctionExpression | ts.ArrowFunction, issues: string[]) {
  const containingBlock = callback.parent.parent.parent;
  const cleaner = ts.isBlock(containingBlock) && containingBlock.statements.find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'clean');
  const attempt = cleaner ? cleaner.body?.statements[0] : undefined;
  const steps = attempt && ts.isTryStatement(attempt) ? attempt.tryBlock.statements : [];
  const [address, strip, returned] = steps;
  const parsed = address && ts.isVariableStatement(address) ? address.declarationList.declarations[0] : undefined;
  if (steps.length !== 3 || parsed?.name.getText() !== 'x' || compact(parsed.initializer) !== 'newURL(u,window.location.href)'
    || !strip || !ts.isExpressionStatement(strip)
    || compact(strip.expression) !== 'strip.forEach(function(k){x.searchParams.delete(k);})'
    || !returned || !ts.isReturnStatement(returned) || compact(returned.expression) !== 'x.toString()') {
    issues.push(`${script.location(returned ?? callback)}: the URL cleaner must strip the documented parameters and return the cleaned address`);
  }
}

function checkCallbackFlow(script: InlineScript, callback: ts.FunctionExpression | ts.ArrowFunction, issues: string[]) {
  const flow: readonly ts.Statement[] = ts.isBlock(callback.body) ? callback.body.statements : [];
  const [, guard, clone] = flow;
  const rejected = guard && ts.isIfStatement(guard) ? guard.thenStatement : undefined;
  const earlyReturn = rejected && ts.isBlock(rejected) && rejected.statements.length === 1 ? rejected.statements[0] : rejected;
  if (!guard || !ts.isIfStatement(guard) || !/^!payload\|\|typeofpayload!==(['"])object\1$/.test(compact(guard.expression))
    || guard.elseStatement || !earlyReturn || !ts.isReturnStatement(earlyReturn) || compact(earlyReturn.expression) !== 'payload') {
    issues.push(`${script.location(guard ?? callback)}: the hook must clean the payload before returning it`);
  }
  const out = clone && ts.isVariableStatement(clone) ? clone.declarationList.declarations[0] : undefined;
  const returned = flow.at(-1);
  if (flow.length !== 7 || out?.name.getText() !== 'out' || compact(out.initializer) !== 'Object.assign({},payload)'
    || !returned || !ts.isReturnStatement(returned) || compact(returned.expression) !== 'out') {
    issues.push(`${script.location(returned ?? callback)}: the hook must return the cleaned payload`);
  }
  const guards = flow.filter(ts.isIfStatement);
  const cleaned = ['url', 'referrer'].map((field) => {
    const member = `out.${field}`;
    const guard = guards.find((node) => compact(node.expression) === member);
    const branch = guard?.thenStatement;
    const steps = branch && ts.isBlock(branch) ? branch.statements : branch ? [branch] : [];
    const assignment = steps[0];
    if (steps.length !== 1 || !assignment || !ts.isExpressionStatement(assignment)
      || compact(assignment.expression) !== `${member}=clean(${member})`) {
      issues.push(`${script.location(assignment ?? guard ?? callback)}: the hook must strip query parameters from the ${field} on the returned payload`);
      return undefined;
    }
    return guard;
  });
  const pageViews = guards.find((node) => /^type===(['"])event\1&&!out\.name$/.test(compact(node.expression)));
  const pageViewBody = pageViews?.thenStatement;
  const steps = pageViewBody && ts.isBlock(pageViewBody) ? pageViewBody.statements : [];
  const [comparison, update] = steps;
  const ordered = pageViews && cleaned.every((step) => step && clone && clone.getStart() < step.getStart()
    && step.getStart() < pageViews.getStart());
  if (!ordered || steps.length !== 2 || !comparison || !ts.isIfStatement(comparison)
    || compact(comparison.expression) !== 'out.url===lastView' || !dropsRequest(comparison.thenStatement)
    || !update || !ts.isExpressionStatement(update) || compact(update.expression) !== 'lastView=out.url') {
    issues.push(`${script.location((ordered ? comparison : pageViews) ?? callback)}: the hook must drop duplicate page views after cleaning the URL`);
  }
}

function checkHook(
  script: InlineScript, callback: ts.FunctionExpression | ts.ArrowFunction,
  privacy: ts.SourceFile, issues: string[],
) {
  const scriptNodes = [...nodes(script.source)];
  const parameters = scriptNodes.find((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && node.name.getText() === 'strip');
  const queryList = parameters?.initializer;
  const paragraphs = [...nodes(privacy)].filter((node): node is ts.JsxElement =>
    ts.isJsxElement(node) && jsxTag(node) === 'p');
  const hookDoc = paragraphs.find((node) => jsxText(node).includes('hook removes the'));
  const documented = hookDoc ? [...codeEntries(hookDoc).keys()].sort() : [];
  const stripped = queryList && ts.isArrayLiteralExpression(queryList)
    ? queryList.elements.map((node) => ts.isStringLiteralLike(node) ? node.text : undefined).sort() : [];
  if (documented.length !== 2 || JSON.stringify(stripped) !== JSON.stringify(documented)) {
    issues.push(`${script.location(queryList ?? callback)}: stripped query parameters disagree with /privacy`);
  }
  checkCleaner(script, callback, issues);
  checkCallbackFlow(script, callback, issues);
  const attempt = ts.isBlock(callback.body) ? callback.body.statements[0] : undefined;
  const optOut = attempt && ts.isTryStatement(attempt) ? attempt.tryBlock.statements[0] : undefined;
  if (!attempt || !ts.isTryStatement(attempt) || attempt.tryBlock.statements.length !== 1
    || attempt.catchClause?.block.statements.length !== 0 || attempt.finallyBlock
    || !optOut || !ts.isIfStatement(optOut)
    || !/^window\.localStorage&&window\.localStorage\.getItem\((['"])umami:disabled\1\)===(['"])true\2$/.test(compact(optOut.expression))
    || optOut.elseStatement || !dropsRequest(optOut.thenStatement)) {
    issues.push(`${script.location(optOut ?? attempt ?? callback)}: opt-out must drop requests when the documented flag is true`);
  }
  const optOutCode = codeEntries(privacy);
  for (const command of [
    'localStorage.setItem(&apos;umami:disabled&apos;, &apos;true&apos;)',
    'localStorage.removeItem(&apos;umami:disabled&apos;)',
  ]) {
    if (!optOutCode.has(command)) issues.push(`${location(privacy)}: missing browser opt-out instruction ${command}`);
  }
  if (!hookDoc || !jsxText(hookDoc).includes('drops a page view when its cleaned address matches the previous one')) {
    issues.push(`${location(hookDoc ?? privacy)}: missing statement about duplicate page views`);
  }
  const pageText = paragraphs.map(jsxText).join(' ');
  for (const wording of [
    'The browser opt-out below does not control this server request',
    'text still being typed is not',
    'automatically sends its question',
  ]) {
    if (!pageText.includes(wording)) issues.push(`${location(privacy)}: missing privacy wording “${wording}”`);
  }
}

function checkTrackerSettings(program: ts.Program, privacy: ts.SourceFile, issues: string[]) {
  const checker = program.getTypeChecker();
  const layout = program.getSourceFile('/' + layoutPath);
  const scripts = layout ? [...nodes(layout)].filter((node): node is ts.JsxOpeningLikeElement =>
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && jsxTag(node) === 'script') : [];
  const trackers = scripts.filter((script) => jsxAttribute(script, 'data-website-id') || jsxAttribute(script, 'data-before-send'));
  if (trackers.length !== 1) {
    issues.push(`${layoutPath}:1: expected one configured analytics script`);
    return;
  }
  const [tracker] = trackers;
  const src = attributeValue(jsxAttribute(tracker, 'src'));
  const url = src && staticString(src, checker);
  const host = /^https:\/\/([^/?#]+)(?:[/?#]|$)/.exec(url ?? '')?.[1];
  const links = [...nodes(privacy)].filter((node): node is ts.JsxElement => ts.isJsxElement(node) && jsxTag(node) === 'a');
  if (!host || !links.some((link) => {
    const href = attributeValue(jsxAttribute(link.openingElement, 'href'));
    return jsxText(link) === host && href && staticString(href, checker) === `https://${host}`;
  })) {
    issues.push(`${location(src ?? tracker)}: analytics script host ${host ?? '(unknown)'} disagrees with /privacy`);
  }
  for (const name of ['data-performance', 'data-tag', 'data-auto-track']) {
    const attribute = jsxAttribute(tracker, name);
    if (!attribute) continue;
    const value = attributeValue(attribute);
    if (name !== 'data-auto-track' || !value || staticString(value, checker) !== 'true') {
      issues.push(`${location(attribute)}: ${name} changes the documented analytics measurements`);
    }
  }
  const hookAttribute = jsxAttribute(tracker, 'data-before-send');
  const hookExpression = attributeValue(hookAttribute);
  const hookName = hookExpression && staticString(hookExpression, checker);
  for (const node of scripts) {
    if (!hookName || node.getStart() >= tracker.getStart()) break;
    const script = parseInlineScript(node, checker);
    if (!script) continue;
    for (const assignment of [...nodes(script.source)].filter(ts.isBinaryExpression)) {
      const { left, right, operatorToken } = assignment;
      if (operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(left)
        && left.expression.getText() === 'window' && left.name.text === hookName
        && (ts.isFunctionExpression(right) || ts.isArrowFunction(right))) {
        checkHook(script, right, privacy, issues);
        return;
      }
    }
  }
  issues.push(`${location(hookAttribute ?? tracker)}: analytics before-send must name the inline hook loaded first`);
}

function clientSources(program: ts.Program): Set<ts.SourceFile> {
  const checker = program.getTypeChecker();
  const files = new Set(program.getSourceFiles().filter((file) => file.fileName.startsWith('/public/')
    || file.statements.some((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)
      && statement.expression.text === 'use client')));
  // Set iteration visits new files and each local file is visited once.
  for (const file of files) {
    for (const statement of file.statements) {
      let specifier: ts.Expression | undefined;
      if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) specifier = statement.moduleSpecifier;
      if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier) || !/^(?:\.|@\/)/.test(specifier.text)) continue;
      const imported = checker.getSymbolAtLocation(specifier)?.declarations?.find(ts.isSourceFile);
      if (imported) files.add(imported);
    }
  }
  return files;
}

function fetchCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'fetch';
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'fetch' && ts.isIdentifier(callee.expression)
    && ['window', 'globalThis', 'self'].includes(callee.expression.text);
}

function checkInputRoutes(program: ts.Program, privacy: ts.SourceFile, issues: string[]) {
  const checker = program.getTypeChecker();
  const documented = new Map([...codeEntries(privacy)].filter(([value]) => value.startsWith('/api/')));
  const configured = new Set<string>();
  const paragraphs = [...nodes(privacy)].filter((node): node is ts.JsxElement =>
    ts.isJsxElement(node) && jsxTag(node) === 'p');
  function documentedRoute(wording: string): string | undefined {
    const paragraph = paragraphs.find((node) => jsxText(node).includes(wording));
    return paragraph && [...codeEntries(paragraph).keys()].find((value) => value.startsWith('/api/'));
  }
  const newsletter = documentedRoute('The newsletter form sends the e-mail address');
  const expectedRoutes = new Map([
    ['/components/docs-bot/useSseStream.ts', documentedRoute('When you ask the docs assistant a question')],
    ['/components/blog/ArticleCompression.tsx', documentedRoute('summary buttons send the article slug')],
    ['/components/landing/EmailCapture.tsx', newsletter],
    ['/components/landing/EmailStrip.tsx', newsletter],
  ]);

  function checkRoute(endpoint: string | undefined, source: ts.Node, expected?: string) {
    if (endpoint) configured.add(endpoint);
    if (!endpoint || !documented.has(endpoint)) {
      issues.push(`${location(source)}: input route ${endpoint ?? '(not a static string)'} is not documented on /privacy`);
    } else if (expected && endpoint !== expected) {
      issues.push(`${location(source)}: input route ${endpoint} does not match ${expected} documented for this feature on /privacy`);
    }
  }

  const confirmedSenders = new Set<string>();
  for (const file of clientSources(program)) {
    const known = expectedRoutes.has(file.fileName);
    const calls = [...nodes(file)].filter(ts.isCallExpression).filter(fetchCall);
    for (const call of calls) {
      const [endpoint, options] = call.arguments;
      const init = options && constantExpression(options, checker);
      const method = field(init, 'method');
      const verb = method && staticString(method, checker)?.toUpperCase();
      const body = field(init, 'body');
      if (known) confirmedSenders.add(file.fileName);
      if (known && (verb !== 'POST' || !body || !init || !ts.isObjectLiteralExpression(init)
        || init.properties.some(ts.isSpreadAssignment))) {
        issues.push(`${location(call)}: cannot verify the request method or body for the documented sender`);
      }
      if (!known && !body && !/^(?:POST|PUT|PATCH|DELETE)$/.test(verb ?? '')) continue;
      const route = endpoint && staticString(endpoint, checker);
      checkRoute(route, endpoint ? constantExpression(endpoint, checker) ?? endpoint : call, expectedRoutes.get(file.fileName));
    }
  }
  for (const filename of expectedRoutes.keys()) {
    if (!confirmedSenders.has(filename)) {
      issues.push(`${filename.slice(1)}:1: cannot find the documented sender in browser source`);
    }
  }

  const config = program.getSourceFile('/' + configPath);
  const headers = config ? [...nodes(config)].filter(ts.isObjectLiteralExpression) : [];
  const expectedReportRoute = documentedRoute('under its content security policy');
  for (const [name, pattern] of [
    ['Content-Security-Policy', /(?:^|;\s*)report-uri\s+([^;\s]+)/],
    ['Reporting-Endpoints', /(?:^|,\s*)csp-endpoint="[^"]*?(\/api\/[^"\s]+)"/],
  ] as const) {
    const header = headers.find((node) => field(node, 'key')?.getText().slice(1, -1) === name);
    const value = field(header, 'value');
    const expression = value && constantExpression(value, checker);
    if (!expression) {
      issues.push(`${configPath}:1: missing ${name} reporting endpoint`);
      continue;
    }
    const parts = ts.isTemplateExpression(expression) ? expression.templateSpans : [];
    const expanded = ts.isTemplateExpression(expression) ? expression.head.text + parts.map((span) =>
      (staticString(span.expression, checker) ?? '{dynamic}') + span.literal.text).join('') : staticString(expression, checker);
    const endpoint = pattern.exec(expanded ?? '')?.[1];
    const binding = endpoint && parts.find((span) => staticString(span.expression, checker) === endpoint);
    const origin = binding ? constantExpression(binding.expression, checker) : expression;
    checkRoute(endpoint, origin ?? expression, expectedReportRoute);
  }

  for (const [route, node] of documented) {
    if (!configured.has(route)) issues.push(`${location(node)}: documented input route ${route} has no matching sender in public source`);
  }
}

function checkHumanServices(program: ts.Program, privacy: ts.SourceFile, issues: string[]) {
  const humans = program.getSourceFile('/' + humansPath);
  const content = humans && [...nodes(humans)].find((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && node.name.getText() === 'content');
  const entries = content ? [...nodes(content)].filter(ts.isStringLiteralLike) : [];
  const items = [...nodes(privacy)].filter((node): node is ts.JsxElement =>
    ts.isJsxElement(node) && jsxTag(node) === 'li');
  for (const [field, wording] of [['Email', 'stores newsletter addresses'], ['CDN', 'as its CDN and hosting providers']]) {
    const entry = entries.find((text) => text.text.startsWith(field + ': '));
    const service = entry?.text.slice(field.length + 2);
    const item = items.find((node) => jsxText(node).includes(wording));
    const documented = item?.children.find((node): node is ts.JsxElement => ts.isJsxElement(node) && jsxTag(node) === 'strong');
    if (!entry || !service) issues.push(`${humansPath}:1: missing ${field} in humans.txt`);
    else if (!documented || jsxText(documented) !== service) {
      issues.push(`${location(entry)}: ${service} from humans.txt is not named as the ${field} service on /privacy`);
    }
  }
}

// Only locally shipped configuration is checked. The remote tracker and
// host-supplied input handlers are outside this source review.
export function checkPublishedPrivacySurfaces(sources: ReadonlyMap<string, string>): string[] {
  const program = sourceProgram(sources);
  const privacy = program.getSourceFile('/' + privacyPath);
  if (!privacy) return [`${privacyPath}:1: missing privacy page`];
  const issues: string[] = [];
  checkTrackerSettings(program, privacy, issues);
  checkInputRoutes(program, privacy, issues);
  checkHumanServices(program, privacy, issues);
  return issues;
}

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
  const property = object.properties.find((prop): prop is ts.PropertyAssignment =>
    ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
    && prop.name.text === name);
  return property?.initializer;
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

function checkHook(
  script: NonNullable<ReturnType<typeof parseInlineScript>>, callback: ts.FunctionExpression | ts.ArrowFunction,
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
  const cleaners = scriptNodes.filter(ts.isCallExpression).map((call) => compact(call));
  if (!cleaners.includes('x.searchParams.delete(k)') || !cleaners.includes('strip.forEach(function(k){x.searchParams.delete(k);})')
    || !cleaners.includes('clean(out.url)') || !cleaners.includes('clean(out.referrer)')) {
    issues.push(`${script.location(callback)}: the hook must strip query parameters from both page and referrer addresses`);
  }
  const conditions = [...nodes(callback)].filter(ts.isIfStatement);
  const optOut = conditions.find((node) => compact(node.expression).includes('.getItem('));
  if (!optOut || !/^window\.localStorage&&window\.localStorage\.getItem\((['"])umami:disabled\1\)===(['"])true\2$/.test(compact(optOut.expression))
    || !dropsRequest(optOut.thenStatement)) {
    issues.push(`${script.location(optOut ?? callback)}: opt-out must drop requests when the documented flag is true`);
  }
  const optOutCode = codeEntries(privacy);
  for (const command of [
    'localStorage.setItem(&apos;umami:disabled&apos;, &apos;true&apos;)',
    'localStorage.removeItem(&apos;umami:disabled&apos;)',
  ]) {
    if (!optOutCode.has(command)) issues.push(`${location(privacy)}: missing browser opt-out instruction ${command}`);
  }
  const pageViews = conditions.find((node) => /^type===(['"])event\1&&!out\.name$/.test(compact(node.expression)));
  const pageViewBody = pageViews?.thenStatement;
  const statements: readonly ts.Statement[] = pageViewBody && ts.isBlock(pageViewBody) ? pageViewBody.statements : [];
  const comparison = statements.find(ts.isIfStatement);
  if (!comparison || compact(comparison.expression) !== 'out.url===lastView' || !dropsRequest(comparison.thenStatement)
    || !statements.some((statement) => ts.isExpressionStatement(statement) && compact(statement.expression) === 'lastView=out.url')) {
    issues.push(`${script.location(comparison ?? pageViews ?? callback)}: the hook must drop duplicate page views after cleaning the URL`);
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

  for (const file of program.getSourceFiles()) {
    const first = file.statements[0];
    if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)
      || first.expression.text !== 'use client') continue;
    for (const call of [...nodes(file)].filter(ts.isCallExpression)) {
      if (!ts.isIdentifier(call.expression) || call.expression.text !== 'fetch') continue;
      const [endpoint, options] = call.arguments;
      const init = options && constantExpression(options, checker);
      const method = field(init, 'method');
      if (!endpoint || !method || staticString(method, checker)?.toUpperCase() !== 'POST' || !field(init, 'body')) continue;
      checkRoute(staticString(endpoint, checker), constantExpression(endpoint, checker) ?? endpoint, expectedRoutes.get(file.fileName));
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

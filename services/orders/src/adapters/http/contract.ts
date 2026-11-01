// Reads services/orders/openapi.yaml and turns every operation into a Fastify
// route definition with its request schemas, so the contract stays the single
// source of truth for the API surface and its input validation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** services/orders/openapi.yaml (same path from src/ and dist/). */
export const CONTRACT_PATH = fileURLToPath(new URL('../../../openapi.yaml', import.meta.url));

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;
export type HttpMethod = Uppercase<(typeof HTTP_METHODS)[number]>;

type JsonObject = Record<string, unknown>;

export interface RequestSchemas {
  params?: JsonObject;
  querystring?: JsonObject;
  body?: JsonObject;
}

export interface Operation {
  /** `GET /health`, `POST /api/v1/orders/{number}/status`: the key handlers are looked up by. */
  readonly key: string;
  readonly method: HttpMethod;
  /** The path as written in the contract with its server prefix (`{param}` style). */
  readonly path: string;
  /** The same path in Fastify's `:param` style. */
  readonly url: string;
  readonly schema: RequestSchemas;
}

export function loadContract(path: string = CONTRACT_PATH): JsonObject {
  const doc: unknown = parse(readFileSync(path, 'utf8'));
  if (!isObject(doc) || !isObject(doc['paths'])) {
    throw new Error(`${path} is not an OpenAPI document with paths`);
  }
  return doc;
}

/** Every operation of the contract, with `$ref`s resolved. */
export function listOperations(doc: JsonObject): Operation[] {
  const resolved = dereference(doc, doc);
  if (!isObject(resolved)) throw new Error('The contract is not an object');
  const paths = asObject(resolved['paths']);
  const rootPrefix = serverPrefix(resolved['servers']) ?? '';
  const operations: Operation[] = [];

  for (const [rawPath, item] of Object.entries(paths)) {
    const pathItem = asObject(item);
    const pathPrefix = serverPrefix(pathItem['servers']) ?? rootPrefix;
    const pathParams = asArray(pathItem['parameters']);

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!isObject(op)) continue;
      const prefix = serverPrefix(op['servers']) ?? pathPrefix;
      const path = joinPath(prefix, rawPath);
      const upper = method.toUpperCase() as HttpMethod;
      operations.push({
        key: `${upper} ${path}`,
        method: upper,
        path,
        url: path.replace(/\{([^}]+)\}/g, ':$1'),
        schema: requestSchemas([...pathParams, ...asArray(op['parameters'])], op['requestBody']),
      });
    }
  }
  return operations;
}

function requestSchemas(parameters: unknown[], requestBody: unknown): RequestSchemas {
  const schema: RequestSchemas = {};
  const params = parameterSchema(parameters, 'path');
  if (params) schema.params = params;
  const querystring = parameterSchema(parameters, 'query');
  if (querystring) schema.querystring = querystring;
  if (isObject(requestBody)) {
    const json = asObject(asObject(requestBody['content'])['application/json']);
    if (isObject(json['schema'])) schema.body = json['schema'];
  }
  return schema;
}

function parameterSchema(
  parameters: unknown[],
  location: 'path' | 'query',
): JsonObject | undefined {
  const properties: JsonObject = {};
  const required: string[] = [];
  for (const raw of parameters) {
    const p = asObject(raw);
    if (p['in'] !== location || typeof p['name'] !== 'string') continue;
    properties[p['name']] = isObject(p['schema']) ? p['schema'] : {};
    if (p['required'] === true || location === 'path') required.push(p['name']);
  }
  if (Object.keys(properties).length === 0) return undefined;
  return { type: 'object', properties, required };
}

/** Inlines every local `$ref` (`#/...`). Throws on a circular reference. */
function dereference(node: unknown, root: JsonObject, seen: readonly string[] = []): unknown {
  if (Array.isArray(node)) return node.map((n) => dereference(n, root, seen));
  if (!isObject(node)) return node;
  const ref = node['$ref'];
  if (typeof ref === 'string') {
    if (!ref.startsWith('#/')) throw new Error(`Only local $ref are supported: ${ref}`);
    if (seen.includes(ref)) throw new Error(`Circular $ref in the contract: ${ref}`);
    return dereference(resolvePointer(root, ref), root, [...seen, ref]);
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, dereference(v, root, seen)]));
}

function resolvePointer(root: JsonObject, ref: string): unknown {
  let current: unknown = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(current) || !(key in current)) throw new Error(`Unresolvable $ref: ${ref}`);
    current = current[key];
  }
  return current;
}

function serverPrefix(servers: unknown): string | undefined {
  if (!Array.isArray(servers) || servers.length === 0) return undefined;
  const url = asObject(servers[0])['url'];
  if (typeof url !== 'string') return undefined;
  return url.replace(/\/+$/, '');
}

function joinPath(prefix: string, path: string): string {
  return `${prefix}${path}` || '/';
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

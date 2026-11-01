// Request validation from the contract's schemas (OpenAPI 3.1 = JSON Schema 2020-12).
// Bodies are validated as sent; path and query values arrive as strings, so
// they are coerced to the declared types and get their defaults.
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { FastifySchemaCompiler } from 'fastify';

// ajv-formats is CommonJS: its default export arrives wrapped under NodeNext.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

function createAjv(coerce: boolean): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    coerceTypes: coerce ? 'array' : false,
    useDefaults: coerce,
    removeAdditional: false,
  });
  addFormats(ajv);
  return ajv;
}

export function createValidatorCompiler(): FastifySchemaCompiler<unknown> {
  const strictAjv = createAjv(false);
  const coercingAjv = createAjv(true);
  return ({ schema, httpPart }) =>
    (httpPart === 'body' ? strictAjv : coercingAjv).compile(schema as object);
}

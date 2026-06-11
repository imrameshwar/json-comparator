// src/schema-validate.js
//
// Hand-rolled JSON Schema (draft-07 subset) validator.
// Zero dependencies, no DOM access, no I/O.
//
// This is the source of truth shared by:
//   - the Vitest unit tests (which `import` this module), and
//   - the web app (json_compare.html), which inlines a byte-identical copy
//     between the SCHEMA-VALIDATE:START / SCHEMA-VALIDATE:END markers.
//     tests/schema-validate.test.js asserts the two copies are identical.
//
// Everything between the markers must stay character-for-character identical
// to the matching block in json_compare.html.
//
// Return shape:
//   validateSchema(schema, data) -> Violation[]
//   Violation = { path: string, message: string }
//   `path` uses JSON Pointer notation, e.g. "" (root), "/name", "/items/0/price"
//   An empty array means the document is valid against the schema.
//
// Supported keywords:
//   type, required, properties, additionalProperties, minProperties, maxProperties,
//   items (single schema or tuple array), additionalItems, minItems, maxItems,
//   uniqueItems, minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf,
//   minLength, maxLength, pattern, enum, const,
//   allOf, anyOf, oneOf, not, if/then/else,
//   $ref (internal #/definitions/... and #/$defs/... only),
//   $defs, definitions (as $ref targets only).
//
// Silently ignored (no crash, no false violations):
//   $schema, $id, title, description, default, examples, format,
//   patternProperties, unevaluatedProperties, unevaluatedItems,
//   dependentRequired, dependentSchemas, contentMediaType, contentEncoding,
//   remote $ref (anything not starting with "#/").

/* SCHEMA-VALIDATE:START */
function _svTypeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // "string" | "number" | "boolean" | "object"
}

function _svIsInteger(v) {
  return typeof v === "number" && Number.isFinite(v) && v === Math.floor(v);
}

function _svDeepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => _svDeepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && _svDeepEqual(a[k], b[k]));
  }
  return false;
}

// Resolve an internal $ref against the root schema.
// Only "#/definitions/..." and "#/$defs/..." are supported; remote refs return null.
function _svResolveRef(ref, root) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = root;
  for (const p of parts) {
    if (typeof node !== "object" || node === null || !Object.prototype.hasOwnProperty.call(node, p)) return null;
    node = node[p];
  }
  return node;
}

// Append a key or index segment to a JSON Pointer path string.
function _svChild(path, key) {
  return path + "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

// Core recursive validator. Returns Violation[].
function _svValidate(schema, data, path, root, depth) {
  if (depth > 32) return []; // guard against circular $ref chains
  // Boolean schemas
  if (schema === true) return [];
  if (schema === false) return [{ path, message: "Schema disallows this value." }];
  if (typeof schema !== "object" || schema === null) return [];

  // $ref takes precedence over sibling keywords (draft-07 spec).
  if ("$ref" in schema) {
    const resolved = _svResolveRef(schema.$ref, root);
    if (resolved === null) return []; // remote or unresolvable ref — skip silently
    return _svValidate(resolved, data, path, root, depth + 1);
  }

  const errs = [];
  const t = _svTypeOf(data);

  // ── type ──────────────────────────────────────────────────────────────────
  if ("type" in schema) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const typeOk = types.some(expected =>
      expected === "integer" ? _svIsInteger(data) : t === expected
    );
    if (!typeOk) {
      errs.push({ path, message: "Expected type " + types.join(" or ") + ", got " + t + "." });
    }
  }

  // ── enum ──────────────────────────────────────────────────────────────────
  if ("enum" in schema && Array.isArray(schema.enum)) {
    if (!schema.enum.some(v => _svDeepEqual(v, data))) {
      errs.push({ path, message: "Value must be one of: " + schema.enum.map(v => JSON.stringify(v)).join(", ") + "." });
    }
  }

  // ── const ─────────────────────────────────────────────────────────────────
  if ("const" in schema) {
    if (!_svDeepEqual(schema.const, data)) {
      errs.push({ path, message: "Value must equal " + JSON.stringify(schema.const) + "." });
    }
  }

  // ── string keywords ───────────────────────────────────────────────────────
  if (typeof data === "string") {
    if ("minLength" in schema && typeof schema.minLength === "number" && data.length < schema.minLength) {
      errs.push({ path, message: "String length " + data.length + " is less than minLength " + schema.minLength + "." });
    }
    if ("maxLength" in schema && typeof schema.maxLength === "number" && data.length > schema.maxLength) {
      errs.push({ path, message: "String length " + data.length + " exceeds maxLength " + schema.maxLength + "." });
    }
    if ("pattern" in schema && typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern, "u").test(data)) {
          errs.push({ path, message: "String does not match pattern /" + schema.pattern + "/." });
        }
      } catch (_e) { /* invalid regex — skip */ }
    }
  }

  // ── number keywords ───────────────────────────────────────────────────────
  if (typeof data === "number") {
    if ("minimum" in schema && typeof schema.minimum === "number" && data < schema.minimum) {
      errs.push({ path, message: "Value " + data + " is less than minimum " + schema.minimum + "." });
    }
    if ("maximum" in schema && typeof schema.maximum === "number" && data > schema.maximum) {
      errs.push({ path, message: "Value " + data + " exceeds maximum " + schema.maximum + "." });
    }
    // exclusiveMinimum: draft-07 = number, draft-04 = boolean (both supported)
    if ("exclusiveMinimum" in schema) {
      const exMin = schema.exclusiveMinimum;
      if (typeof exMin === "number" && data <= exMin) {
        errs.push({ path, message: "Value " + data + " must be strictly greater than exclusiveMinimum " + exMin + "." });
      } else if (exMin === true && "minimum" in schema && data <= schema.minimum) {
        errs.push({ path, message: "Value " + data + " must be strictly greater than " + schema.minimum + " (exclusiveMinimum)." });
      }
    }
    if ("exclusiveMaximum" in schema) {
      const exMax = schema.exclusiveMaximum;
      if (typeof exMax === "number" && data >= exMax) {
        errs.push({ path, message: "Value " + data + " must be strictly less than exclusiveMaximum " + exMax + "." });
      } else if (exMax === true && "maximum" in schema && data >= schema.maximum) {
        errs.push({ path, message: "Value " + data + " must be strictly less than " + schema.maximum + " (exclusiveMaximum)." });
      }
    }
    if ("multipleOf" in schema && typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
      const rem = data % schema.multipleOf;
      const tol = Math.abs(data) * Number.EPSILON * 8;
      if (Math.abs(rem) > tol && Math.abs(rem - schema.multipleOf) > tol) {
        errs.push({ path, message: "Value " + data + " is not a multiple of " + schema.multipleOf + "." });
      }
    }
  }

  // ── object keywords ───────────────────────────────────────────────────────
  if (t === "object") {
    const objKeys = Object.keys(data);

    if ("required" in schema && Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          errs.push({ path, message: "Required property \"" + key + "\" is missing." });
        }
      }
    }

    if ("minProperties" in schema && typeof schema.minProperties === "number" && objKeys.length < schema.minProperties) {
      errs.push({ path, message: "Object has " + objKeys.length + " properties, minimum is " + schema.minProperties + "." });
    }
    if ("maxProperties" in schema && typeof schema.maxProperties === "number" && objKeys.length > schema.maxProperties) {
      errs.push({ path, message: "Object has " + objKeys.length + " properties, maximum is " + schema.maxProperties + "." });
    }

    const propSchemas = (typeof schema.properties === "object" && schema.properties !== null) ? schema.properties : {};

    for (const key of Object.keys(propSchemas)) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const sub = _svValidate(propSchemas[key], data[key], _svChild(path, key), root, depth);
        for (const e of sub) errs.push(e);
      }
    }

    if ("additionalProperties" in schema) {
      const addl = schema.additionalProperties;
      const knownProps = new Set(Object.keys(propSchemas));
      for (const key of objKeys) {
        if (!knownProps.has(key)) {
          const cp = _svChild(path, key);
          if (addl === false) {
            errs.push({ path: cp, message: "Additional property \"" + key + "\" is not allowed (additionalProperties: false)." });
          } else if (typeof addl === "object" && addl !== null) {
            const sub = _svValidate(addl, data[key], cp, root, depth);
            for (const e of sub) errs.push(e);
          }
        }
      }
    }
  }

  // ── array keywords ────────────────────────────────────────────────────────
  if (t === "array") {
    if ("minItems" in schema && typeof schema.minItems === "number" && data.length < schema.minItems) {
      errs.push({ path, message: "Array has " + data.length + " item" + (data.length === 1 ? "" : "s") + ", minimum is " + schema.minItems + "." });
    }
    if ("maxItems" in schema && typeof schema.maxItems === "number" && data.length > schema.maxItems) {
      errs.push({ path, message: "Array has " + data.length + " item" + (data.length === 1 ? "" : "s") + ", maximum is " + schema.maxItems + "." });
    }

    if ("items" in schema) {
      const itemsS = schema.items;
      if (Array.isArray(itemsS)) {
        // Tuple validation
        for (let idx = 0; idx < Math.min(data.length, itemsS.length); idx++) {
          const sub = _svValidate(itemsS[idx], data[idx], _svChild(path, idx), root, depth);
          for (const e of sub) errs.push(e);
        }
        if ("additionalItems" in schema && data.length > itemsS.length) {
          const ai = schema.additionalItems;
          for (let idx = itemsS.length; idx < data.length; idx++) {
            const cp = _svChild(path, idx);
            if (ai === false) {
              errs.push({ path: cp, message: "Additional item at index " + idx + " is not allowed (additionalItems: false)." });
            } else if (typeof ai === "object" && ai !== null) {
              const sub = _svValidate(ai, data[idx], cp, root, depth);
              for (const e of sub) errs.push(e);
            }
          }
        }
      } else {
        // All-items schema
        for (let idx = 0; idx < data.length; idx++) {
          const sub = _svValidate(itemsS, data[idx], _svChild(path, idx), root, depth);
          for (const e of sub) errs.push(e);
        }
      }
    }

    if (schema.uniqueItems === true) {
      const seen = [];
      for (let idx = 0; idx < data.length; idx++) {
        if (seen.some(v => _svDeepEqual(v, data[idx]))) {
          errs.push({ path: _svChild(path, idx), message: "Duplicate item at index " + idx + " (uniqueItems: true)." });
        } else {
          seen.push(data[idx]);
        }
      }
    }
  }

  // ── composition keywords ──────────────────────────────────────────────────
  if ("allOf" in schema && Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      const subErrs = _svValidate(sub, data, path, root, depth);
      for (const e of subErrs) errs.push(e);
    }
  }

  if ("anyOf" in schema && Array.isArray(schema.anyOf)) {
    const anyOk = schema.anyOf.some(sub => _svValidate(sub, data, path, root, depth).length === 0);
    if (!anyOk) {
      errs.push({ path, message: "Value does not match any of the expected schemas (anyOf)." });
    }
  }

  if ("oneOf" in schema && Array.isArray(schema.oneOf)) {
    const oneCount = schema.oneOf.filter(sub => _svValidate(sub, data, path, root, depth).length === 0).length;
    if (oneCount !== 1) {
      errs.push({ path, message: "Value must match exactly one schema (oneOf), matched " + oneCount + "." });
    }
  }

  if ("not" in schema) {
    const notErrs = _svValidate(schema.not, data, path, root, depth);
    if (notErrs.length === 0) {
      errs.push({ path, message: "Value must not match the 'not' schema." });
    }
  }

  if ("if" in schema) {
    const ifErrs = _svValidate(schema.if, data, path, root, depth);
    if (ifErrs.length === 0) {
      if ("then" in schema) {
        const sub = _svValidate(schema.then, data, path, root, depth);
        for (const e of sub) errs.push(e);
      }
    } else {
      if ("else" in schema) {
        const sub = _svValidate(schema.else, data, path, root, depth);
        for (const e of sub) errs.push(e);
      }
    }
  }

  return errs;
}

/**
 * validateSchema(schema, data) → Violation[]
 *
 * Validates `data` against `schema` (JSON Schema draft-07 subset).
 *
 * @param {object|boolean} schema  Parsed JSON Schema object or boolean.
 * @param {*}              data    Parsed JSON value to validate.
 * @returns {Array<{path: string, message: string}>}
 *   Empty array = valid. `path` is a JSON Pointer string ("" = root,
 *   "/name" = top-level key, "/items/0/price" = nested path).
 */
function validateSchema(schema, data) {
  if (schema === null || schema === undefined) return [];
  return _svValidate(schema, data, "", schema, 0);
}
/* SCHEMA-VALIDATE:END */

export { validateSchema };

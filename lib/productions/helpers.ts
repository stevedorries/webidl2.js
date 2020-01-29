import { Type } from "./type.ts";
import { Argument } from "./argument.ts";
import { ExtendedAttributes, SimpleExtendedAttribute } from "./extended-attributes.ts";
import { Operation } from "./operation.ts";
import { Attribute } from "./attribute.ts";
import { Tokeniser, TokeniserToken } from "../tokeniser.ts";
import { Base } from "./base.ts";

export function unescape(identifier: string) {
  return identifier.startsWith('_') ? identifier.slice(1) : identifier;
}

/**
 * Parses comma-separated list
 * @param {object} args
 * @param {Function} args.parser parser function for each item
 * @param {boolean} [args.allowDangler] whether to allow dangling comma
 * @param {string} [args.listName] the name to be shown on error messages
 */
export function list<T extends Base>(tokeniser: Tokeniser, { parser, allowDangler = false, listName = "list" }: {parser: (tokeniser?: Tokeniser) => T, allowDangler?: boolean, listName?: string}) {
  const first = parser(tokeniser);
  if (!first) {
    return [];
  }
  first.tokens.separator = tokeniser.consume(",");
  const items: T[] = [first];
  while (first.tokens.separator) {
    const item = parser(tokeniser);
    if (!item) {
      if (!allowDangler) {
        tokeniser.error(`Trailing comma in ${listName}`);
      }
      break;
    }
    item.tokens.separator = tokeniser.consume(",");
    items.push(item);
    if (!item.tokens.separator) break;
  }
  return items;
}


export function const_value(tokeniser: Tokeniser) {
  return tokeniser.consume("true", "false", "Infinity", "-Infinity", "NaN", "decimal", "integer");
}


export function const_data({type, value}:{ type:string, value:string }) {
  switch (type) {
    case "true":
    case "false":
      return { type: "boolean", value: type === "true" };
    case "Infinity":
    case "-Infinity":
      return { type: "Infinity", negative: type.startsWith("-") };
    case "[":
      return { type: "sequence", value: [] };
    case "{":
      return { type: "dictionary" };
    case "decimal":
    case "integer":
      return { type: "number", value };
    case "string":
      return { type: "string", value: value.slice(1, -1) };
    default:
      return { type };
  }
}


export function primitive_type(tokeniser: Tokeniser) {
  function integer_type() {
    const prefix = tokeniser.consume("unsigned");
    const base = tokeniser.consume("short", "long");
    if (base) {
      const postfix = tokeniser.consume("long");
      return new Type({ source, tokens: { prefix, base, postfix } });
    }
    if (prefix) tokeniser.error("Failed to parse integer type");
  }

  function decimal_type() {
    const prefix = tokeniser.consume("unrestricted");
    const base = tokeniser.consume("float", "double");
    if (base) {
      return new Type({ source, tokens: { prefix, base } });
    }
    if (prefix) tokeniser.error("Failed to parse float type");
  }

  const { source } = tokeniser;
  const num_type = integer_type() || decimal_type();
  if (num_type) return num_type;
  const base = tokeniser.consume("boolean", "byte", "octet");
  if (base) {
    return new Type({ source, tokens: { base } });
  }
}


export function argument_list(tokeniser: Tokeniser) {
  return list(tokeniser, { parser: Argument.parse, listName: "arguments list" });
}


export function type_with_extended_attributes(tokeniser: Tokeniser, typeName?: string): Type {
  const extAttrs = ExtendedAttributes.parse(tokeniser);
  const ret = Type.parse(tokeniser, typeName);
  if (ret) {
    autoParenter(ret).extAttrs = extAttrs;
  }
  return ret;
}

export function return_type(tokeniser: Tokeniser, typeName: string = "return-type") {
  const typ = Type.parse(tokeniser, typeName || "return-type");
  if (typ) {
    return typ;
  }
  const voidToken = tokeniser.consume("void");
  if (voidToken) {
    const ret = new Type({ source: tokeniser.source, tokens: { base: voidToken } });
    ret.type = "return-type";
    return ret;
  }
}

export function stringifier(tokeniser: Tokeniser) {
  const special = tokeniser.consume("stringifier");
  if (!special) return;
  const member = Attribute.parse(tokeniser, { special }) ||
    Operation.parse(tokeniser, { special }) ||
    tokeniser.error("Unterminated stringifier");
  return member;
}

export function getLastIndentation(str: string) {
  const lines = str.split("\n");
  // the first line visually binds to the preceding token
  if (lines.length) {
    const match = lines[lines.length - 1].match(/^\s+/);
    if (match) {
      return match[0];
    }
  }
  return "";
}

export function getMemberIndentation(parentTrivia: string) {
  const indentation = getLastIndentation(parentTrivia);
  const indentCh = indentation.includes("\t") ? "\t" : "  ";
  return indentation + indentCh;
}


export function autofixAddExposedWindow(def: any) {
  return () => {
    if (def.extAttrs.length){
      const tokeniser = new Tokeniser("Exposed=Window,");
      const exposed = SimpleExtendedAttribute.parse(tokeniser);
      exposed.tokens.separator = tokeniser.consume(",");
      const existing = def.extAttrs[0];
      if (!/^\s/.test(existing.tokens.name.trivia)) {
        existing.tokens.name.trivia = ` ${existing.tokens.name.trivia}`;
      }
      def.extAttrs.unshift(exposed);
    } else {
      autoParenter(def).extAttrs = ExtendedAttributes.parse(new Tokeniser("[Exposed=Window]"));
      const trivia = def.tokens.base.trivia;
      def.extAttrs.tokens.open.trivia = trivia;
      def.tokens.base.trivia = `\n${getLastIndentation(trivia)}`;
    }
  };
}

/**
 * Get the first syntax token for the given IDL object.
 */
export function getFirstToken(data: any): TokeniserToken {
  if (data.extAttrs.length) {
    return data.extAttrs.tokens.open;
  }
  if (data.type === "operation" && !data.special) {
    return getFirstToken(data.idlType);
  }
  const tokens: TokeniserToken[] = Object.values(data.tokens as TokeniserToken[]).sort((x, y) => x.index - y.index);
  return tokens[0];
}

export function findLastIndex<T>(array: T[], predicate: (item:T) => boolean) {
  const index = array.slice().reverse().findIndex(predicate);
  if (index === -1) {
    return index;
  }
  return array.length - index - 1;
}

/**
 * Returns a proxy that auto-assign `parent` field.
 * @template T
 * @param {T} data
 * @param {*} [parent] The object that will be assigned to `parent`.
 *                     If absent, it will be `data` by default.
 * @return {T}
 */
export function autoParenter<T extends object>(data: T, parent?: any): T {
  if (!parent) {
    // Defaults to `data` unless specified otherwise.
    parent = data;
  }
  if (!data) {
    // This allows `autoParenter(undefined)` which again allows
    // `autoParenter(parse())` where the function may return nothing.
    return data;
  }
  return new Proxy<T>(data, {
    get(target, p) {
      const value = target[p];
      if (Array.isArray(value)) {
        // Wraps the array so that any added items will also automatically
        // get their `parent` values.
        return autoParenter(value, target);
      }
      return value;
    },
    set(target, p, value) {
      target[p] = value;
      if (!value) {
        return true;
      } else if (Array.isArray(value)) {
        // Assigning an array will add `parent` to its items.
        for (const item of value) {
          if (typeof item.parent !== "undefined") {
            item.parent = parent;
          }
        }
      } else if (typeof value.parent !== "undefined") {
        value.parent = parent;
      }
      return true;
    }
  });
}

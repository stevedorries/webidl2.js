import { Base, TokenDictionary } from "./base.ts";
import { type_with_extended_attributes, unescape, autoParenter } from "./helpers.ts";
import { Tokeniser } from "../tokeniser.ts";

export class Attribute extends Base {
  static parse(tokeniser: Tokeniser, { special, noInherit = false, readonly = false } = { special: undefined}) {
    const start_position = tokeniser.position;
    const tokens: TokenDictionary = { special };
    const ret = autoParenter(new Attribute({ source: tokeniser.source, tokens }));
    if (!special && !noInherit) {
      tokens.special = tokeniser.consume("inherit");
    }
    if (ret.special === "inherit" && tokeniser.probe("readonly")) {
      tokeniser.error("Inherited attributes cannot be read-only");
    }
    tokens.readonly = tokeniser.consume("readonly");
    if (readonly && !tokens.readonly && tokeniser.probe("attribute")) {
      tokeniser.error("Attributes must be readonly in this context");
    }
    tokens.base = tokeniser.consume("attribute");
    if (!tokens.base) {
      tokeniser.unconsume(start_position);
      return;
    }
    ret.idlType = type_with_extended_attributes(tokeniser, "attribute-type") || tokeniser.error("Attribute lacks a type") as any;
    switch (ret.idlType.generic) {
      case "sequence":
      case "record": tokeniser.error(`Attributes cannot accept ${ret.idlType.generic} types`);
    }
    tokens.name = tokeniser.consume("identifier", "async", "required") || tokeniser.error("Attribute lacks a name") as any;
    tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated attribute, expected `;`") as any;
    return ret.this;
  }

  get type() {
    return "attribute";
  }
  get special() {
    if (!this.tokens.special) {
      return "";
    }
    return this.tokens.special.value;
  }
  get readonly() {
    return !!this.tokens.readonly;
  }
  get name() {
    return unescape(this.tokens.name.value);
  }

  *validate(defs) {
    yield* this.idlType.validate(defs);
  }
}

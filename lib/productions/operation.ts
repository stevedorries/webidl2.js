import { Base } from "./base.ts";
import { return_type, argument_list, unescape, autoParenter } from "./helpers.ts";
import { validationError } from "../error.ts";
import { Tokeniser, TokeniserToken } from "../tokeniser.ts";
import { Type } from "./type.ts";

export class Operation extends Base {
  idlType: Type | void;
  arguments: any[];
 
  
  static parse(tokeniser: Tokeniser, { special, regular }: {special?:TokeniserToken, regular?:TokeniserToken} = {special: undefined, regular: undefined}) {
    const tokens: any = { special };
    const ret = autoParenter(new Operation({ source: tokeniser.source, tokens }));
    if (special && special.value === "stringifier") {
      tokens.termination = tokeniser.consume(";");
      if (tokens.termination) {
        ret.arguments = [];
        return ret;
      }
    }
    if (!special && !regular) {
      tokens.special = tokeniser.consume("getter", "setter", "deleter");
    }
    ret.idlType = return_type(tokeniser) || tokeniser.error("Missing return type");
    tokens.name = tokeniser.consume("identifier", "includes");
    tokens.open = tokeniser.consume("(") || tokeniser.error("Invalid operation");
    ret.arguments = argument_list(tokeniser);
    tokens.close = tokeniser.consume(")") || tokeniser.error("Unterminated operation");
    tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated operation, expected `;`");
    return ret.this;
  }

  get type() {
    return "operation";
  }
  get name() {
    const { name } = this.tokens;
    if (!name) {
      return "";
    }
    return unescape(name.value);
  }
  get special() {
    if (!this.tokens.special) {
      return "";
    }
    return this.tokens.special.value;
  }

  *validate(defs) {
    if (!this.name && ["", "static"].includes(this.special)) {
      const message = `Regular or static operations must have both a return type and an identifier.`;
      yield validationError(this.tokens.open, this, "incomplete-op", message);
    }
    if (this.idlType) {
      yield* this.idlType.validate(defs);
    }
    for (const argument of this.arguments) {
      yield* argument.validate(defs);
    }
  }
}

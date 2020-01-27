import { Container } from "./container.ts";
import { Attribute } from "./attribute.ts";
import { Operation } from "./operation.ts";
import { Constant } from "./constant.ts";
import { IterableLike } from "./iterable.ts";
import { stringifier, autofixAddExposedWindow, getMemberIndentation, getLastIndentation, getFirstToken, findLastIndex, autoParenter } from "./helpers.ts";
import { validationError } from "../error.ts";
import { checkInterfaceMemberDuplication } from "../validators/interface.ts";
import { Constructor } from "./constructor.ts";
import { Tokeniser, TokeniserToken } from "../tokeniser.ts";
import { TokenDictionary } from "./base.ts";
import { SimpleExtendedAttribute, ExtendedAttributes } from "./extended-attributes.ts";

function static_member(tokeniser: Tokeniser) {
  const special = tokeniser.consume("static");
  if (!special) return;
  const member = Attribute.parse(tokeniser, { special }) ||
    Operation.parse(tokeniser, { special }) ||
    tokeniser.error("No body in static member");
  return member;
}

export class Interface extends Container {
  get type() {
    return "interface";
  }

  static parse(tokeniser: Tokeniser, opts: any = {partial: undefined, base: undefined}) {
    const { partial, base } = opts;
    const tokens = {partial, base}; 
    return Container.parse(tokeniser, new Interface({ source: tokeniser.source, tokens }), {
      type: "interface",
      inheritable: !partial,
      allowedMembers: [
        [Constant.parse],
        [Constructor.parse],
        [static_member],
        [stringifier],
        [IterableLike.parse],
        [Attribute.parse],
        [Operation.parse]
      ]
    });
  }

  *validate(defs) {
    yield* this.extAttrs.validate(defs);
    if (
      !this.partial &&
      this.extAttrs.every(extAttr => extAttr.name !== "Exposed") &&
      this.extAttrs.every(extAttr => extAttr.name !== "NoInterfaceObject")
    ) {
      const message = `Interfaces must have \`[Exposed]\` extended attribute. \
To fix, add, for example, \`[Exposed=Window]\`. Please also consider carefully \
if your interface should also be exposed in a Worker scope. Refer to the \
[WebIDL spec section on Exposed](https://heycam.github.io/webidl/#Exposed) \
for more information.`;
      yield validationError(this.tokens.name, this, "require-exposed", message, {
        autofix: autofixAddExposedWindow(this)
      });
    }
    const oldConstructors = this.extAttrs.filter(extAttr => extAttr.name === "Constructor");
    for (const constructor of oldConstructors) {
      const message = `Constructors should now be represented as a \`constructor()\` operation on the interface \
instead of \`[Constructor]\` extended attribute. Refer to the \
[WebIDL spec section on constructor operations](https://heycam.github.io/webidl/#idl-constructors) \
for more information.`;
      yield validationError(constructor.tokens.name, this, "constructor-member", message, {
        autofix: autofixConstructor(this, constructor)
      });
    }

    const isGlobal = this.extAttrs.some(extAttr => extAttr.name === "Global");
    if (isGlobal) {
      const namedConstructors = this.extAttrs.filter(extAttr => extAttr.name === "NamedConstructor");
      for (const named of namedConstructors) {
        const message = `Interfaces marked as \`[Global]\` cannot have named constructors.`;
        yield validationError(named.tokens.name, this, "no-constructible-global", message);
      }

      const constructors = this.members.filter(member => member.type === "constructor");
      for (const named of constructors) {
        const message = `Interfaces marked as \`[Global]\` cannot have constructors.`;
        yield validationError(named.tokens.base, this, "no-constructible-global", message);
      }
    }

    yield* super.validate(defs);
    if (!this.partial) {
      yield* checkInterfaceMemberDuplication(defs, this);
    }
  }
}

function autofixConstructor(interfaceDef: Interface, constructorExtAttr: SimpleExtendedAttribute) {
  interfaceDef = autoParenter(interfaceDef);
  return () => {
    const indentation = getLastIndentation(interfaceDef.extAttrs.tokens.open.trivia);
    const memberIndent = interfaceDef.members.length ?
      getLastIndentation(getFirstToken(interfaceDef.members[0]).trivia) :
      getMemberIndentation(indentation);
    const constructorOp = Constructor.parse(new Tokeniser(`\n${memberIndent}constructor();`));
    constructorOp.extAttrs = [] as ExtendedAttributes;
    autoParenter(constructorOp).arguments = constructorExtAttr.arguments;

    const existingIndex = findLastIndex(interfaceDef.members, m => m.type === "constructor");
    interfaceDef.members.splice(existingIndex + 1, 0, constructorOp);

    const { close }  = interfaceDef.tokens;
    if (!close.trivia.includes("\n")) {
      close.trivia += `\n${indentation}`;
    }

    const { extAttrs } = interfaceDef;
    const index = extAttrs.indexOf(constructorExtAttr);
    const removed = extAttrs.splice(index, 1);
    if (!extAttrs.length) {
      extAttrs.tokens.open = extAttrs.tokens.close = undefined;
    } else if (extAttrs.length === index) {
      extAttrs[index - 1].tokens.separator = undefined;
    } else if (!extAttrs[index].tokens.name.trivia.trim()) {
      extAttrs[index].tokens.name.trivia = removed[0].tokens.name.trivia;
    }
  };
}

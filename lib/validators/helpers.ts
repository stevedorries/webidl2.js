import { Definitions } from "../validator.ts";
import { Dictionary } from "../productions/dictionary.ts";
import { Type } from "../productions/type.ts";

export interface IdlTypeDictionary {
  reference : Type;
  dictionary: any;
}
/**
 * @param {object} [options]
 * @param {boolean} [options.useNullableInner] use when the input idlType is nullable and you want to use its inner type
 * @return the type reference that ultimately includes dictionary.
 */
export function idlTypeIncludesDictionary(idlType: Type, defs: Definitions, { useNullableInner } = { useNullableInner: false}): IdlTypeDictionary {
  if (!idlType.union) {
    const def = defs.unique.get(idlType.idlType);
    if (!def) {
      return;
    }
    if (def.type === "typedef") {
      const { typedefIncludesDictionary } = defs.cache;
      if (typedefIncludesDictionary.has(def)) {
        // Note that this also halts when it met indeterminate state
        // to prevent infinite recursion
        return typedefIncludesDictionary.get(def);
      }
      defs.cache.typedefIncludesDictionary.set(def, undefined); // indeterminate state
      const result = idlTypeIncludesDictionary(def.idlType, defs);
      defs.cache.typedefIncludesDictionary.set(def, result);
      if (result) {
        return {
          reference: idlType,
          dictionary: result.dictionary
        };
      }
    }
    if (def.type === "dictionary" && (useNullableInner || !idlType.nullable)) {
      return {
        reference: idlType,
        dictionary: def
      };
    }
  }
  for (const subtype of idlType.subtype) {
    const result = idlTypeIncludesDictionary(subtype, defs);
    if (result) {
      if (subtype.union) {
        return result;
      }
      return {
        reference: subtype,
        dictionary: result.dictionary
      };
    }
  }
}

export function dictionaryIncludesRequiredField(dict: any, defs: Definitions) : boolean {
  if (defs.cache.dictionaryIncludesRequiredField.has(dict)) {
    return defs.cache.dictionaryIncludesRequiredField.get(dict);
  }
  defs.cache.dictionaryIncludesRequiredField.set(dict, undefined); // indeterminate
  if (dict.inheritance) {
    const superdict = defs.unique.get(dict.inheritance);
    if (!superdict) {
      return true;
    }
    if (dictionaryIncludesRequiredField(superdict, defs)) {
      return true;
    }
  }
  const result = (dict.members as any[]).some(field => field.required);
  defs.cache.dictionaryIncludesRequiredField.set(dict, result);
  return result;
}

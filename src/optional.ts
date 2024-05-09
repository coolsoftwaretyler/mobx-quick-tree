import { types as mstTypes } from "mobx-state-tree";
import { BaseType } from "./base";
import { ensureRegistered } from "./class-model";
import type {
  CreateTypes,
  IAnyStateTreeNode,
  IAnyType,
  InstanceWithoutSTNTypeForType,
  TreeContext,
  IOptionalType,
  IStateTreeNode,
  ValidOptionalValue,
} from "./types";

export type DefaultFuncOrValue<T extends IAnyType> = T["InputType"] | T["OutputType"] | (() => CreateTypes<T>);

export class OptionalType<
  T extends IAnyType,
  OptionalValues extends [ValidOptionalValue, ...ValidOptionalValue[]] = [undefined],
> extends BaseType<T["InputType"] | OptionalValues[number], T["OutputType"], InstanceWithoutSTNTypeForType<T>> {
  constructor(
    readonly type: T,
    readonly defaultValueOrFunc: DefaultFuncOrValue<T>,
    readonly undefinedValues: OptionalValues = [undefined] as any,
  ) {
    super(
      undefinedValues
        ? mstTypes.optional(type.mstType, defaultValueOrFunc, undefinedValues)
        : mstTypes.optional(type.mstType, defaultValueOrFunc),
    );
  }

  instantiate(snapshot: this["InputType"], context: TreeContext, parent: IStateTreeNode | null): this["InstanceType"] {
    if (this.undefinedValues) {
      if (this.undefinedValues.includes(snapshot)) {
        snapshot = this.defaultValue;
      }
    } else if (snapshot === undefined) {
      snapshot = this.defaultValue;
    }

    return this.type.instantiate(snapshot, context, parent);
  }

  is(value: IAnyStateTreeNode): value is this["InstanceType"];
  is(value: any): value is this["InputType"] | this["InstanceType"] {
    if (this.undefinedValues) {
      if (this.undefinedValues.includes(value)) {
        return true;
      }
    } else if (value === undefined) {
      return true;
    }

    return this.type.is(value);
  }

  async schemaHash() {
    return `optional:${await this.type.schemaHash()}`;
  }

  private get defaultValue(): T["InputType"] {
    return this.defaultValueOrFunc instanceof Function ? this.defaultValueOrFunc() : this.defaultValueOrFunc;
  }
}

export type OptionalFactory = {
  <T extends IAnyType>(type: T, defaultValue: DefaultFuncOrValue<T>): IOptionalType<T, [undefined]>;
  <T extends IAnyType, OptionalValues extends [ValidOptionalValue, ...ValidOptionalValue[]]>(
    type: T,
    defaultValue: DefaultFuncOrValue<T>,
    undefinedValues: OptionalValues,
  ): IOptionalType<T, OptionalValues>;
};

export const optional: OptionalFactory = <T extends IAnyType, OptionalValues extends [ValidOptionalValue, ...ValidOptionalValue[]]>(
  type: T,
  defaultValue: DefaultFuncOrValue<T>,
  undefinedValues?: OptionalValues,
): IOptionalType<T, OptionalValues> => {
  ensureRegistered(type);
  return new OptionalType(type, defaultValue, undefinedValues);
};

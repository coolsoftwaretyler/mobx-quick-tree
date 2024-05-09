import { types } from "mobx-state-tree";
import { BaseType } from "./base";
import type { IAnyStateTreeNode, TreeContext, ISimpleType, IStateTreeNode } from "./types";
import memoize from "lodash.memoize";

class EnumerationType<EnumOptions extends string> extends BaseType<EnumOptions, EnumOptions, EnumOptions> {
  constructor(
    readonly name: string,
    readonly options: readonly EnumOptions[],
  ) {
    super(types.enumeration<EnumOptions>(name, [...options]));
  }

  instantiate(snapshot: this["InputType"], _context: TreeContext, _parent: IStateTreeNode | null): this["InstanceType"] {
    if (typeof snapshot == "string" && this.options.includes(snapshot)) {
      return snapshot as this["InstanceType"];
    }
    throw new Error(`Unknown enum value \`${snapshot}\`. Options are: ${this.options.join(", ")}`);
  }

  is(value: IAnyStateTreeNode): value is this["InstanceType"];
  is(value: any): value is this["InputType"] | this["InstanceType"] {
    return this.options.includes(value);
  }

  schemaHash: () => Promise<string> = memoize(async () => {
    return `enum:${this.options.join("|")}`;
  });
}

type EnumerationFactory = {
  <EnumOptions extends string>(name: string, options: readonly EnumOptions[]): ISimpleType<EnumOptions>;
  <EnumOptions extends string>(options: readonly EnumOptions[]): ISimpleType<EnumOptions>;
};

export const enumeration: EnumerationFactory = <EnumOptions extends string>(
  nameOrOptions: readonly EnumOptions[] | string,
  options?: readonly EnumOptions[],
): ISimpleType<EnumOptions> => {
  let name;
  if (typeof nameOrOptions == "string") {
    name = nameOrOptions;
    options ??= [];
  } else {
    name = "enumeration";
    options = nameOrOptions;
  }
  return new EnumerationType(name, options);
};

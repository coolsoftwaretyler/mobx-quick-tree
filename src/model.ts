import type { IAnyModelType as MSTAnyModelType, IAnyType as MSTAnyType } from "mobx-state-tree";
import { isReferenceType, isStateTreeNode as mstIsStateTreeNode, types as mstTypes } from "mobx-state-tree";
import { types } from ".";
import { BaseType, setParent } from "./base";
import { ensureRegistered } from "./class-model";
import { CantRunActionError } from "./errors";
import { $identifier, $originalDescriptor, $readOnly, $type } from "./symbols";
import type {
  IAnyStateTreeNode,
  IAnyType,
  INodeModelType,
  InputTypesForModelProps,
  InputsForModel,
  Instance,
  InstanceTypesForModelProps,
  InstantiateContext,
  ModelActions,
  ModelProperties,
  ModelPropertiesDeclaration,
  ModelViews,
  OutputTypesForModelProps,
  TypesForModelPropsDeclaration,
} from "./types";

export const propsFromModelPropsDeclaration = <Props extends ModelPropertiesDeclaration>(
  propsDecl: Props
): TypesForModelPropsDeclaration<Props> => {
  const props: Record<string, IAnyType> = {};
  for (const name in propsDecl) {
    const value = propsDecl[name];
    switch (typeof value) {
      case "string":
        props[name] = types.optional(types.string, value);
        break;
      case "boolean":
        props[name] = types.optional(types.boolean, value);
        break;
      case "number":
        props[name] = types.optional(types.number, value);
        break;
      default:
        if (value instanceof Date) {
          props[name] = types.optional(types.Date, value);
          break;
        }
        ensureRegistered(value);
        props[name] = value;
        break;
    }
  }
  return props as TypesForModelPropsDeclaration<Props>;
};

export const mstPropsFromQuickProps = <Props extends ModelProperties>(props: Props): Record<string, MSTAnyType> => {
  const mstProps: Record<string, MSTAnyType> = {};
  for (const name in props) {
    mstProps[name] = props[name].mstType;
  }
  return mstProps;
};

const assignProps = (target: any, source: any) => {
  if (target && source) {
    const descriptors = Object.getOwnPropertyDescriptors(source);
    for (const name in descriptors) {
      const desc = descriptors[name];
      const getter = desc.get;
      if (getter) {
        let cached = false;
        let cachedValue: unknown;
        Object.defineProperty(target, name, {
          get() {
            if (cached) return cachedValue;
            cachedValue = getter.apply(target);
            cached = true;
            return cachedValue;
          },
          configurable: true,
        });
      } else {
        target[name] = desc.value;
      }
    }
  }
};

export const instantiateInstanceFromProperties = (
  instance: any,
  snapshot: Record<string, any> | undefined,
  properties: ModelProperties,
  identifierProp: string | undefined,
  context: InstantiateContext
) => {
  for (const propName in properties) {
    const propType = properties[propName];
    if (isReferenceType(propType.mstType)) {
      context.referencesToResolve.push(() => {
        const propValue = propType.instantiate(snapshot?.[propName], context);
        instance[propName] = propValue;
      });
      continue;
    }

    const propValue = propType.instantiate(snapshot?.[propName], context);
    setParent(propValue, instance);
    instance[propName] = propValue;
  }

  if (identifierProp) {
    const id = instance[identifierProp];
    Object.defineProperty(instance, $identifier, { value: id });
    context.referenceCache.set(id, instance);
  }
};

export const defaultThrowAction = (name: string, originalDescriptor?: PropertyDescriptor) => {
  const overriddenThrowAction = () => {
    throw new CantRunActionError(`Can't run action "${name}" for a readonly instance`);
  };

  (overriddenThrowAction as any)[$originalDescriptor] = originalDescriptor;

  return overriddenThrowAction;
};

export type ModelInitializer = (self: any) => void;

export class ModelType<Props extends ModelProperties, Others> extends BaseType<
  InputsForModel<InputTypesForModelProps<Props>>,
  OutputTypesForModelProps<Props>,
  InstanceTypesForModelProps<Props> & Others
> {
  readonly Props!: Props;
  readonly Others!: Others;
  readonly mstType!: MSTAnyModelType;

  private identifierProp: string | undefined;
  private prototype: this["InstanceType"];

  constructor(readonly properties: Props, readonly initializers: ModelInitializer[], mstType: MSTAnyModelType, prototype?: any) {
    super(mstType);
    Object.defineProperty(this, "mstType", {
      value: mstType,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    this.identifierProp = this.mstType.identifierAttribute;

    if (prototype) {
      this.prototype = Object.create(prototype);
    } else {
      this.prototype = {} as this["InstanceType"];
    }
    (this.prototype as any)[$type] = this;
    (this.prototype as any)[$readOnly] = true;
  }

  views<Views extends ModelViews>(fn: (self: Instance<this>) => Views): ModelType<Props, Others & Views> {
    const init = (self: Instance<this>) => assignProps(self, fn(self));
    return new ModelType<Props, Others & Views>(this.properties, [...this.initializers, init], this.mstType.views(fn), this.prototype);
  }

  actions<Actions extends ModelActions>(fn: (self: Instance<this>) => Actions): ModelType<Props, Others & Actions> {
    const prototype = Object.create(this.prototype);
    const actions = fn(null as Instance<this>); // assumes action blocks are never referencing `self` during instantiation
    for (const name of Object.keys(actions)) {
      prototype[name] = defaultThrowAction(name);
    }

    return new ModelType<Props, Others & Actions>(this.properties, this.initializers, this.mstType.actions(fn), prototype);
  }

  props<AdditionalProps extends ModelPropertiesDeclaration>(
    propsDecl: AdditionalProps
  ): ModelType<Props & TypesForModelPropsDeclaration<AdditionalProps>, Others> {
    const props = propsFromModelPropsDeclaration(propsDecl);
    return new ModelType(
      { ...this.properties, ...props },
      this.initializers,
      this.mstType.props(mstPropsFromQuickProps(props)),
      this.prototype
    );
  }

  named(newName: string): ModelType<Props, Others> {
    return new ModelType(this.properties, this.initializers, this.mstType.named(newName));
  }

  volatile<VolatileState extends ModelViews>(fn: (self: Instance<this>) => VolatileState): INodeModelType<Props, Others & VolatileState> {
    const init = (self: Instance<this>) => assignProps(self, fn(self));
    return new ModelType<Props, Others & VolatileState>(this.properties, [...this.initializers, init], this.mstType.volatile(fn));
  }

  extend<Actions extends ModelActions, Views extends ModelViews, VolatileState extends ModelViews>(
    fn: (self: Instance<this>) => {
      actions?: Actions;
      views?: Views;
      state?: VolatileState;
    }
  ): INodeModelType<Props, Others & Actions & Views & VolatileState> {
    const init = (self: Instance<this>) => {
      const result = fn(self);
      assignProps(self, result.views);
      assignProps(self, result.state);
      assignProps(self, result.actions);
    };

    return new ModelType<Props, Others & Actions & Views & VolatileState>(
      this.properties,
      [...this.initializers, init],
      this.mstType.extend<Actions, Views, VolatileState>(fn)
    );
  }

  is(value: IAnyStateTreeNode): value is this["InstanceType"];
  is(value: any): value is this["InputType"] | this["InstanceType"] {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    if (value[$type] === this) {
      return true;
    }

    if (mstIsStateTreeNode(value)) {
      return this.mstType.is(value);
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return false;
    }

    for (const name in this.properties) {
      if (!this.properties[name].is(value[name])) {
        return false;
      }
    }

    return true;
  }

  instantiate(snapshot: this["InputType"] | undefined, context: InstantiateContext): this["InstanceType"] {
    const instance: Record<string | symbol, any> = Object.create(this.prototype);

    instantiateInstanceFromProperties(instance, snapshot, this.properties, this.identifierProp, context);
    for (const init of this.initializers) {
      init(instance);
    }

    return instance as this["InstanceType"];
  }
}

export type ModelFactory = {
  (): INodeModelType<{}, {}>;
  (name: string): INodeModelType<{}, {}>;
  <Props extends ModelPropertiesDeclaration>(properties: Props): INodeModelType<TypesForModelPropsDeclaration<Props>, {}>;
  <Props extends ModelPropertiesDeclaration>(name: string, properties: Props): INodeModelType<TypesForModelPropsDeclaration<Props>, {}>;
};

export const model: ModelFactory = <Props extends ModelPropertiesDeclaration>(
  nameOrProperties?: string | Props,
  properties?: Props
): INodeModelType<TypesForModelPropsDeclaration<Props>, {}> => {
  let propsDecl: Props;
  let name = "model";
  if (typeof nameOrProperties === "string") {
    name = nameOrProperties;
    propsDecl = properties ?? ({} as Props);
  } else {
    propsDecl = nameOrProperties ?? ({} as Props);
  }

  const props = propsFromModelPropsDeclaration(propsDecl);
  return new ModelType(props, [], mstTypes.model(name, mstPropsFromQuickProps(props)));
};

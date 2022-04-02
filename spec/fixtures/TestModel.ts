import { SnapshotIn, types } from "../../src";

export const NamedThing = types
  .model("BooleanWrapper", {
    name: types.string,
  })
  .views((self) => ({
    lowerCasedName() {
      return self.name.toLowerCase();
    },

    upperCasedName() {
      return self.name.toUpperCase();
    },
  }));

export const TestModel = types
  .model("TestModel", {
    bool: types.boolean,
    frozen: types.frozen<{ test: "string" }>(),
    nested: NamedThing,
    array: types.array(NamedThing),
    map: types.map(NamedThing),
  })
  .views((self) => ({
    get notBool() {
      return !self.bool;
    },

    get arrayLength(): number {
      return self.array.length;
    },
  }))
  .actions((self) => ({
    setB(v: boolean) {
      self.bool = v;
    },
  }));

export const TestModelSnapshot: SnapshotIn<typeof TestModel> = {
  bool: true,
  frozen: { test: "string" },
  nested: { name: "MiXeD CaSe" },
};

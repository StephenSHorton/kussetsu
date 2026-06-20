import * as React from "react";

/** Typed context factory that throws if consumed outside its Provider. */
function getStrictContext<T>(
  name?: string,
): readonly [
  ({ value, children }: { value: T; children?: React.ReactNode }) => React.JSX.Element,
  () => T,
] {
  const Context = React.createContext<T | undefined>(undefined);

  const Provider = ({ value, children }: { value: T; children?: React.ReactNode }) =>
    React.createElement(Context.Provider, { value }, children);

  const useSafeContext = () => {
    const ctx = React.useContext(Context);
    if (ctx === undefined) {
      throw new Error(`useContext must be used within ${name ?? "a Provider"}`);
    }
    return ctx;
  };

  return [Provider, useSafeContext] as const;
}

export { getStrictContext };

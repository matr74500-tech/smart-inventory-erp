import * as React from "react";

export const FormFieldContext = React.createContext<{
  name: string;
} | null>(null);

export const FormItemContext = React.createContext<{
  id: string;
} | null>(null);

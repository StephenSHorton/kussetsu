import { useState } from "react";
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldContent,
  FieldTitle,
  FieldSeparator,
} from "../ui/field";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export const meta = {
  title: "Field",
  description: "A layout primitive that arranges glass controls into labeled rows with consistent gaps.",
  minH: "min-h-[360px]",
};

export default function Demo() {
  const [email, setEmail] = useState("");
  const invalid = email.length > 0 && !email.includes("@");

  return (
    <FieldSet className="w-96 max-w-full">
      <FieldLegend>Account</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="field-email">Email</FieldLabel>
          <Input
            id="field-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid}
          />
          <FieldDescription>We'll never share it.</FieldDescription>
          {invalid && <FieldError>Enter a valid email address.</FieldError>}
        </Field>

        <FieldSeparator>then</FieldSeparator>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Weekly digest</FieldTitle>
            <FieldDescription>A glass-fresh recap, every Monday.</FieldDescription>
          </FieldContent>
          <Switch defaultChecked />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

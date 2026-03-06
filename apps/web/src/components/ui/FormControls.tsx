import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { classNames } from "../../lib/format";

type BaseFieldProps = {
  label: string;
  hint?: string;
  containerClassName?: string;
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & BaseFieldProps;

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  BaseFieldProps & {
    children: ReactNode;
  };

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & BaseFieldProps;

function FieldWrapper({ label, hint, className, children }: BaseFieldProps & { className?: string; children: ReactNode }) {
  return (
    <label className={classNames("form-field", className)}>
      <span className="form-label">{label}</span>
      {children}
      {hint ? <span className="form-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ label, hint, containerClassName, className, ...props }: InputProps) {
  return (
    <FieldWrapper className={containerClassName} hint={hint} label={label}>
      <input className={classNames("input-control", className)} {...props} />
    </FieldWrapper>
  );
}

export function Select({ label, hint, containerClassName, className, children, ...props }: SelectProps) {
  return (
    <FieldWrapper className={containerClassName} hint={hint} label={label}>
      <select className={classNames("input-control", className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
}

export function TextArea({ label, hint, containerClassName, className, ...props }: TextAreaProps) {
  return (
    <FieldWrapper className={containerClassName} hint={hint} label={label}>
      <textarea className={classNames("input-control", className)} {...props} />
    </FieldWrapper>
  );
}

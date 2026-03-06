import type { ButtonHTMLAttributes } from "react";
import { classNames } from "../../lib/format";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function getButtonClassName(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string
): string {
  return classNames("ui-button", `ui-button-${variant}`, size === "sm" && "ui-button-sm", className);
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button className={getButtonClassName(variant, size, className)} type={type} {...props} />;
}

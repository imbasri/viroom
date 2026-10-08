import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center rounded-md text-sm font-medium",
    "transition-colors focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none",
    "disabled:opacity-50",
  ),
  {
    variants: {
      variant: {
        default: "bg-zinc-200 text-zinc-900 hover:bg-zinc-100",
        destructive: "bg-red-500 text-zinc-50 hover:bg-red-600",
        outline: "border border-zinc-700 bg-transparent hover:bg-zinc-800",
        secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        ghost: "text-zinc-300 hover:bg-zinc-800",
        link: "text-zinc-200 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-10 rounded-md px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export const Button = ({ className, variant, size, ...props }: ButtonProps) => (
  <button
    className={cn(buttonVariants({ variant, size, className }))}
    {...props}
  />
);

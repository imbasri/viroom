import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-sm",
      className,
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: ComponentProps<"h3">) => (
  <h3
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
);

export const CardDescription = ({
  className,
  ...props
}: ComponentProps<"p">) => (
  <p
    className={cn("text-sm text-zinc-400", className)}
    {...props}
  />
);

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
);

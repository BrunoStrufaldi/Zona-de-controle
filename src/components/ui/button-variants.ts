import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-expo",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-strong hover:shadow-glow",
        secondary:
          "border border-border bg-raised text-foreground hover:border-border-strong hover:bg-hover",
        outline:
          "border border-border bg-transparent text-foreground hover:border-primary/60 hover:text-primary",
        ghost: "text-muted-foreground hover:bg-hover hover:text-foreground",
        destructive: "bg-danger/15 text-danger hover:bg-danger/25",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

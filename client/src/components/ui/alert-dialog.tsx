import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Renders the AlertDialog root with a data-slot attribute for styling and passes all received props to Radix's Root.
 *
 * @param props - Props forwarded to Radix AlertDialog.Root
 * @returns The rendered AlertDialog root element
 */
function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

/**
 * Renders an AlertDialog trigger element that opens the dialog and applies a styling hook.
 *
 * This component renders Radix's AlertDialog.Trigger with a `data-slot="alert-dialog-trigger"` attribute and forwards all received props.
 *
 * @returns A JSX element representing the AlertDialog trigger
 */
function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

/**
 * Renders a Radix Portal configured for the alert dialog and forwards all received props.
 *
 * @param props - Props passed through to the underlying Radix `Portal` component.
 * @returns The rendered `AlertDialogPrimitive.Portal` element with `data-slot="alert-dialog-portal"` and forwarded props.
 */
function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

/**
 * Renders the alert dialog backdrop overlay with responsive backdrop styling and open/close animations.
 *
 * @returns The AlertDialog overlay element to be rendered as the dialog backdrop
 */
function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders positioned alert dialog content wrapped in a portal with an overlay and responsive size variants.
 *
 * @param size - Selects the content size variant; `"sm"` produces a more compact dialog width, `"default"` uses the standard width.
 * @returns The alert dialog content element, including its backdrop (overlay) and portal wrappers.
 */
function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

/**
 * Renders the AlertDialog header container used to group the title and supporting elements.
 *
 * The element includes a `data-slot="alert-dialog-header"` attribute for styling hooks and
 * applies layout and responsive classes; additional classes may be merged via `className`.
 *
 * @param className - Additional CSS classes to merge with the component's default classes
 * @param props - Remaining `div` props are forwarded to the underlying element
 * @returns The header element for an alert dialog's content area
 */
function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the alert dialog footer that arranges action controls responsively.
 *
 * @returns A `div` element used as the alert dialog footer which arranges children in a column-reverse layout on small screens and a right-aligned row on larger screens, merging any additional `className` supplied via props.
 */
function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders an alert dialog title element with default styling and a `data-slot` attribute for styling hooks.
 *
 * @returns The AlertDialog title element.
 */
function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the AlertDialog description element with the library's default description styles.
 *
 * @param className - Additional CSS class names to apply to the description element
 * @param props - Additional props forwarded to Radix's `AlertDialog.Description`
 * @returns A JSX element containing the styled alert dialog description
 */
function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * Renders the media area used inside the AlertDialog layout.
 *
 * @returns The media container element for an alert dialog.
 */
function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders an AlertDialog action as a styled Button that acts as the dialog's affirmative/action control.
 *
 * @param className - Additional class names to apply to the underlying action element.
 * @param variant - Visual variant passed to the Button (e.g., `"default"`, `"ghost"`, etc.).
 * @param size - Size passed to the Button (e.g., `"default"`, `"sm"`).
 * @returns The rendered action element for an AlertDialog that triggers the configured action when activated.
 */
function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

/**
 * Renders a styled cancel control for an AlertDialog that closes the dialog when activated.
 *
 * @param className - Additional CSS classes applied to the underlying cancel element
 * @param variant - Button visual variant to apply
 * @param size - Button size to apply
 * @returns A JSX element combining a Button and Radix AlertDialog.Cancel that triggers dialog dismissal
 */
function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}

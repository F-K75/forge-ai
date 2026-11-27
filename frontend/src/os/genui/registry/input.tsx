/**
 * Input components: Button, TextField, Select, Toggle, Form. Inputs are
 * controlled by the surface data model through their `value` DataBinding and
 * write back with ctx.write. Actions go through ctx.dispatch (optimistic
 * pending state + confirmation hook in ../actions.ts).
 */
import { useId, type FormEvent } from "react"
import clsx from "clsx"
import { Button as UiButton, type ButtonVariant } from "../../../components/ui/Button"
import type { CoreComponentProps } from "./types"
import { FIELD, FOCUS, LABEL } from "./styles"

const VARIANT: Record<string, ButtonVariant> = {
  primary: "primary",
  secondary: "secondary",
  tonal: "tonal",
  ghost: "ghost",
  danger: "outlined",
}

export function Button({ node, ctx }: CoreComponentProps) {
  const label = ctx.str(node.label, "Continue")
  const danger = node.variant === "danger"
  return (
    <div className="flex flex-col gap-1" data-a2ui="Button">
      <UiButton
        variant={VARIANT[String(node.variant)] ?? "secondary"}
        size="sm"
        className={clsx("w-fit", danger && "border-error/40 text-error hover:bg-error/10")}
        disabled={node.disabled !== undefined && ctx.bool(node.disabled)}
        loading={ctx.pending}
        onClick={() => ctx.dispatch(node.action, undefined, { destructive: danger, label })}
      >
        {label}
      </UiButton>
      {ctx.actionError && (
        <p role="alert" className="text-xs text-error">
          {ctx.actionError}
        </p>
      )}
    </div>
  )
}

export function TextField({ node, ctx }: CoreComponentProps) {
  const id = useId()
  const label = ctx.str(node.label)
  const raw = ctx.read(node.value)
  const value = typeof raw === "string" || typeof raw === "number" ? String(raw) : ""
  const maxLength = typeof node.maxLength === "number" ? node.maxLength : 20000
  const placeholder = typeof node.placeholder === "string" ? node.placeholder : undefined
  return (
    <div className="flex flex-col gap-1" data-a2ui="TextField">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {node.multiline === true ? (
        <textarea
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={4}
          onChange={(e) => ctx.write(node.value, e.target.value)}
          className={clsx(FIELD, "resize-y")}
        />
      ) : (
        // The catalog pins `secret` to false: never a password field.
        <input
          id={id}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => ctx.write(node.value, e.target.value)}
          className={FIELD}
        />
      )}
    </div>
  )
}

export function Select({ node, ctx }: CoreComponentProps) {
  const id = useId()
  const options = (Array.isArray(node.options) ? node.options : []) as { value: string; label: string }[]
  const raw = ctx.read(node.value)
  const value = typeof raw === "string" ? raw : ""
  return (
    <div className="flex flex-col gap-1" data-a2ui="Select">
      <label htmlFor={id} className={LABEL}>
        {ctx.str(node.label)}
      </label>
      <select id={id} value={value} onChange={(e) => ctx.write(node.value, e.target.value)} className={FIELD}>
        {!options.some((o) => o.value === value) && (
          <option value="" disabled>
            Choose…
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Toggle({ node, ctx }: CoreComponentProps) {
  const id = useId()
  const on = ctx.read(node.value) === true
  return (
    <div className="flex items-center justify-between gap-3" data-a2ui="Toggle">
      <label htmlFor={id} className="text-body text-ink">
        {ctx.str(node.label)}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => ctx.write(node.value, !on)}
        className={clsx(
          "relative h-6 w-10 shrink-0 rounded-pill border transition-colors",
          FOCUS,
          on ? "border-transparent bg-accent" : "border-border bg-ink/[0.06]"
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-ink transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  )
}

export function Form({ node, ctx }: CoreComponentProps) {
  const submitLabel = typeof node.submitLabel === "string" ? node.submitLabel : "Submit"
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!ctx.pending) ctx.dispatch(node.submit, undefined, { label: submitLabel })
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-a2ui="Form">
      {ctx.children(node.children)}
      {ctx.actionError && (
        <p role="alert" className="text-xs text-error">
          {ctx.actionError}
        </p>
      )}
      <UiButton type="submit" variant="primary" size="sm" className="w-fit" loading={ctx.pending}>
        {submitLabel}
      </UiButton>
    </form>
  )
}

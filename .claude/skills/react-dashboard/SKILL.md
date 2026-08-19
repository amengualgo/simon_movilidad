---
name: react-dashboard
description: React 18 + Vite dashboard development - data fetching (TanStack Query), forms (react-hook-form + zod), global state (Zustand), and UI composition (Radix + Tailwind, shadcn pattern). Use for building admin/dashboard SPAs.
metadata:
  version: "1.0.0"
  domain: frontend
  triggers: React, Vite, TanStack Query, React Router, Zustand, Radix UI, Tailwind CSS, react-hook-form, dashboard SPA
  role: specialist
  scope: implementation
  output-format: code
---

# React Dashboard Skill

Dashboard/admin SPA development with React 18, Vite, and a TanStack Query + Zustand state split.

## Core Workflow

1. **Analyze** - Understand the API contract, identify routes, data shape, and form requirements
2. **Design** - Plan route/layout structure, decide server-state vs client-state boundaries
3. **Implement** - Build with composable components, schema-validated forms
4. **Wire data** - Connect TanStack Query for server state; Zustand only for genuinely global UI/auth state
5. **Test** - Write component/integration tests with Vitest + React Testing Library; run `npm test` and confirm all pass
6. **Optimize** - Check bundle size, loading/error states, accessibility before shipping

## Quick Start Templates

### Query Hook (TanStack Query)
```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useProducts(search: string) {
  return useQuery({
    queryKey: ["products", { search }],
    queryFn: () => api.get<Product[]>("/api/v1/products", { params: { search } }).then(r => r.data),
  });
}
```

### Mutation Hook with Cache Invalidation
```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductRequest) => api.post<Product>("/api/v1/products", input).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
```

### Form (react-hook-form + zod)
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().min(0),
});
type ProductFormValues = z.infer<typeof productSchema>;

export function ProductForm({ onSubmit }: { onSubmit: (v: ProductFormValues) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ProductFormValues>({ resolver: zodResolver(productSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} aria-invalid={!!errors.name} />
      {errors.name && <span role="alert">{errors.name.message}</span>}

      <input type="number" step="0.01" {...register("price")} />
      {errors.price && <span role="alert">{errors.price.message}</span>}

      <button type="submit" disabled={isSubmitting}>Save</button>
    </form>
  );
}
```

### Zustand Store (global, non-server state only)
```tsx
import { create } from "zustand";

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));

// Usage - select only what's needed to avoid unnecessary re-renders
const token = useAuthStore((s) => s.token);
```

### Component (Radix + Tailwind, shadcn-style variant API)
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils"; // tailwind-merge wrapper

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-accent",
      },
      size: { default: "h-10 px-4 py-2", sm: "h-9 px-3" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

### Route with Loader (React Router v7)
```tsx
import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  {
    path: "/products",
    element: <ProductsPage />,
    loader: async () => api.get<Product[]>("/api/v1/products").then(r => r.data),
  },
]);
```

### Test (Vitest + React Testing Library)
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProductForm } from "./ProductForm";

describe("ProductForm", () => {
  it("submits valid data", async () => {
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox", { name: /name/i }), "Widget");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Widget" }));
  });
});
```

## Constraints

### MUST DO
- Server state via TanStack Query only — never copy fetched data into `useState`/Zustand
- `zod` schema shared/aligned with backend DTOs for every form
- Radix primitives for anything interactive (dialogs, dropdowns, tooltips) for built-in accessibility
- Loading, error, and empty states handled explicitly for every async view
- `aria-*` attributes and semantic roles on all form errors and interactive elements
- Route-level code splitting for non-critical pages

### MUST NOT DO
- Field injection of API clients via global singletons that bypass testability
- Duplicate server data into Zustand "just in case"
- Skip client-side validation because the backend also validates
- Install shadcn/ui components as a package — copy the component source into the repo per the established pattern
- Use `useEffect` to synchronize state that TanStack Query already manages
- Reach for Redux/Context for state that is local to one component tree

## Accessibility & UX Checklist

- **Color contrast**: text ≥4.5:1, large text/icons ≥3:1 (WCAG AA) — verify against the actual Tailwind palette in use, not by eye
- **Keyboard navigation**: every interactive element reachable and operable via Tab/Enter/Space/Esc; Radix primitives already handle focus trapping and roving tabindex — extend their `onKeyDown`, don't replace it
- **Visible focus**: never strip `:focus-visible` outlines with `outline-none` unless replaced by an equally visible custom ring
- **Touch targets**: minimum 44x44px hit area for buttons/icons at responsive/mobile breakpoints
- **Motion**: wrap non-essential transitions/animations in a `prefers-reduced-motion` check
- **Live regions**: content that appears without user action (toasts, async validation, optimistic updates) needs `aria-live="polite"` or `role="status"`
- **Labels**: every input has a programmatic label (`<label htmlFor>` or `aria-label`) — placeholder text is not a label

## Architecture Patterns

**Project Structure:**
```
src/
├── routes/         # route components + loaders
├── components/      # shared/reusable UI (shadcn-style primitives)
├── features/        # feature-scoped components + hooks (e.g. products/, orders/)
├── hooks/           # cross-feature custom hooks
├── stores/          # Zustand stores (global concerns only)
├── lib/             # api client, utils (cn, formatters)
└── types/           # shared TS types/interfaces
```

**State Boundaries:**
- Server state (anything from the API) → TanStack Query
- Global client state (auth, theme, sidebar open/closed) → Zustand
- Local UI state (form fields, toggle, hover) → `useState`/`useReducer` in the component
- URL state (filters, pagination, selected tab) → search params, not component state

## Common Patterns Reference

| Concern | Tool | Notes |
|---------|------|-------|
| Data fetching | TanStack Query | `queryKey` includes all params that affect the result |
| Mutations | TanStack Query | Invalidate or optimistically update on success |
| Forms | react-hook-form + zod | `zodResolver`, field-level errors |
| Global state | Zustand | Selector-based access, action methods, not direct `set` |
| Styling | Tailwind + cva | Variant props, `tailwind-merge` for override-safe `className` |
| Icons | lucide-react | Tree-shakeable, consistent stroke width |
| HTTP client | axios | Centralized instance with interceptors for auth/errors |
| Routing | React Router v7 | Loaders for route-level data, nested layouts |

## Knowledge Base

React 18, Vite 6, TypeScript, React Router v7, TanStack Query v5, react-hook-form, zod, @hookform/resolvers, Zustand, Radix UI, Tailwind CSS, class-variance-authority, tailwind-merge, lucide-react, axios, Vitest, React Testing Library

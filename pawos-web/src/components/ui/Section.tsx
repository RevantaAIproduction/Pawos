import type { ReactNode } from "react";
import { Container } from "./Container";

export function Section({
  eyebrow,
  title,
  subtitle,
  children,
  className = "",
  id,
}: {
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`py-16 sm:py-20 ${className}`}>
      <Container>
        {(eyebrow || title || subtitle) && (
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{eyebrow}</p>
            )}
            {title && <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>}
            {subtitle && <p className="mt-4 text-base text-neutral-400">{subtitle}</p>}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}

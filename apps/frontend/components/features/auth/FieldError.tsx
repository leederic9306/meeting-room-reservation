interface FieldErrorProps {
  message?: string;
}

export function FieldError({ message }: FieldErrorProps): JSX.Element | null {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

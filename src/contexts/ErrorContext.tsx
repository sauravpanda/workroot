import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export interface AppError {
  id: string;
  message: string;
  detail?: string;
  severity: "error" | "warning" | "info";
  timestamp: number;
}

interface ErrorContextValue {
  errors: AppError[];
  reportError: (
    message: string,
    detail?: string,
    severity?: AppError["severity"],
  ) => void;
  dismissError: (id: string) => void;
  clearErrors: () => void;
}

export const ErrorContext = createContext<ErrorContextValue>({
  errors: [],
  reportError: () => {},
  dismissError: () => {},
  clearErrors: () => {},
});

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<AppError[]>([]);
  const counterRef = useRef(0);

  const reportError = useCallback(
    (
      message: string,
      detail?: string,
      severity: AppError["severity"] = "error",
    ) => {
      const id = `err-${Date.now()}-${++counterRef.current}`;
      const entry: AppError = { id, message, detail, severity, timestamp: Date.now() };
      setErrors((prev) => [...prev.slice(-9), entry]); // cap at 10
    },
    [],
  );

  const dismissError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return (
    <ErrorContext.Provider value={{ errors, reportError, dismissError, clearErrors }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useErrorReporter() {
  return useContext(ErrorContext);
}

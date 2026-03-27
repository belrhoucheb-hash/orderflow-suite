import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
          <div className="rounded-lg border border-red-200 bg-red-50 p-8 max-w-md">
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              Er is iets misgegaan
            </h2>
            <p className="text-sm text-red-600 mb-4">
              {this.state.error?.message || "Een onverwachte fout is opgetreden."}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Probeer opnieuw
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertCircle, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: string | null
}

export class WhatsAppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("WhatsApp Error:", error, errorInfo)
    this.setState({
      errorInfo: errorInfo.componentStack
    })
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center bg-destructive/5 rounded-xl border border-destructive/20 m-4">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-lg font-bold text-destructive mb-2">Algo salió mal en el Chat</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Se produjo un error al cargar los datos de WhatsApp. Esto puede deberse a la conexión o a un dato corrupto.
          </p>
          
          <div className="w-full bg-black/5 dark:bg-white/5 rounded-md p-4 mb-6 overflow-auto text-left">
            <p className="text-xs font-mono text-red-500 mb-2">
              Error: {this.state.error?.message || "Error desconocido"}
            </p>
            {this.state.errorInfo && (
              <pre className="text-[10px] font-mono text-muted-foreground leading-tight">
                {this.state.errorInfo.split("\n").slice(0, 5).join("\n")}
              </pre>
            )}
          </div>

          <Button onClick={this.handleReset} variant="outline" className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            Recargar página
          </Button>
        </div>
      )
    }

    return this.children
  }
}

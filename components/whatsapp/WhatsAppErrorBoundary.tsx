"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
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
    console.error("WhatsApp Runtime Error:", error, errorInfo)
    this.setState({ errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-destructive/5 text-destructive min-h-[300px]">
          <AlertCircle className="w-12 h-12 mb-4" />
          <h2 className="text-lg font-bold mb-2">Algo salió mal en el Chat</h2>
          <pre className="text-xs bg-background p-4 rounded border max-w-full overflow-auto mb-4 font-mono text-foreground">
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack?.split("\n").slice(0, 3).join("\n")}
          </pre>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Recargar página
          </Button>
        </div>
      )
    }

    return this.children
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export default class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Spyda workspace crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-primary/10" />
          <h1 className="font-heading text-xl font-semibold">Spyda recovered the workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something interrupted the canvas. Refresh the workspace and upload again; your app will no longer go blank.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-5 text-sm font-bold text-primary-foreground"
          >
            Reload Workspace
          </button>
        </div>
      </div>
    )
  }
}

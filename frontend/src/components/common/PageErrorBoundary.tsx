import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Keeps a crashing page from blanking the whole app: shows the error and a retry instead. */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main className="content-area" id="main-content">
        <section className="cc-panel nw-crash" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <h1>This page hit an error</h1>
            <p>{error.message || 'Unexpected error'}</p>
            <button className="cc-button cc-button--primary" type="button" onClick={() => this.setState({ error: null })}>
              <RotateCcw size={14} aria-hidden="true" /> Try again
            </button>
          </div>
        </section>
      </main>
    )
  }
}

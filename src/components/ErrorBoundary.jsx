import { Component } from 'react';

// If a screen hits an error, show a way out instead of a blank page
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Screen error', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // Moving to another screen clears it
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page page--narrow crash">
        <p className="label ox">Something went wrong</p>
        <h1 className="h-page">This screen didn’t load.</h1>
        <p className="muted">Nothing was lost. Go back, or reload to try again.</p>
        <div className="btn-row">
          <button type="button" className="btn btn--sm" onClick={() => window.location.reload()}>Reload</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.history.back()}>Go back</button>
        </div>
      </main>
    );
  }
}

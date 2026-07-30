"use client";
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary caught:', error.message);
    console.error('Component stack:', info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white/95 backdrop-blur-sm p-6 rounded-2xl shadow-lg m-4 text-center">
          <h2 className="text-xl font-black text-[#e21b3c] mb-2">⚠️ حدث خطأ</h2>
          <p className="text-gray-500 font-bold text-sm">حدث خطأ أثناء تحميل الصفحة. يرجى المحاولة مرة أخرى.</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="mt-4 px-6 py-2 bg-[#46178f] text-white rounded-xl font-bold"
          >
            إعادة تحميل
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
